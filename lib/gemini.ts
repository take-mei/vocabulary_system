// Gemini APIを使って単語の難易度(1〜5)を判定するヘルパー。
// このファイルはサーバー側(APIルート)からのみ呼び出すこと。GEMINI_API_KEYを外部に渡さない。

import { WordSetType } from '@/lib/types';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// Gemini APIからのエラーをHTTPステータス付きで表現する。
// 429(利用上限到達)かどうかを呼び出し側(APIルート・管理画面)で判別できるようにする。
export class GeminiApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeminiApiError';
    this.status = status;
  }
}

function throwGeminiError(status: number, errText: string): never {
  if (status === 429) {
    throw new GeminiApiError(
      'Gemini APIの利用上限(レート制限/1日の無料枠)に達しました。時間を置くか、翌日以降に再試行してください。' +
        `詳細: ${errText.slice(0, 300)}`,
      429
    );
  }
  throw new GeminiApiError(`Gemini APIエラー(${status}): ${errText}`, status);
}

// --- Gemini呼び出しの共通処理 ---
//
// 【重要】Gemini 2.5以降のモデルは、回答の前に「考える(thinking)」処理をする。
// その考えるために使うトークンは、maxOutputTokens(出力の上限)から差し引かれる。
// 上限が小さい(例: 256)と、考えるだけで使い切ってしまい、回答が `{ "mean": "` のように
// 途中で切れる(または空になる)。単語の翻訳や難易度のように、考える必要のない処理では、
// thinking を最小にして、上限にも余裕を持たせる。
//
// thinking の指定はモデルによって書き方が違う(3系: thinkingLevel / 2.5系: thinkingBudget)ため、
// 受け付けられるものを順に試し、通った指定は覚えておく。
type ThinkingEffort = 'minimal' | 'low';

function thinkingAttempts(effort: ThinkingEffort): Array<Record<string, unknown> | null> {
  return [
    { thinkingLevel: effort },
    { thinkingBudget: effort === 'minimal' ? 0 : 1024 },
    null, // thinkingの指定を一切受け付けないモデル(考える分も使える上限を確保して呼ぶ)
  ];
}

let workingThinkingAttempt = 0; // 通った指定の番号(同じサーバーインスタンス内で、無駄な試行を省く)

interface GeminiCallOptions {
  prompt: string;
  // maxOutputTokens は「回答そのもの」に必要なトークン数の目安を指定する(考える分は含めない)
  generationConfig: Record<string, unknown> & { maxOutputTokens: number };
  thinking: ThinkingEffort;
}

interface GeminiCallResult {
  text: string;
  finishReason?: string;
}

async function callGemini(opts: GeminiCallOptions): Promise<GeminiCallResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('環境変数 GEMINI_API_KEY が設定されていません');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const attempts = thinkingAttempts(opts.thinking);

  let maxTokens = opts.generationConfig.maxOutputTokens;

  // 1回目: 通常 / 2回目: 回答が途中で切れた(MAX_TOKENS)場合に、上限を倍にしてもう一度
  for (let round = 0; round < 2; round++) {
    let result: GeminiCallResult | null = null;

    for (let i = workingThinkingAttempt; i < attempts.length; i++) {
      const thinkingConfig = attempts[i];
      // thinkingを制御できない場合は、考える分も賄えるよう、上限を大きく取る
      const tokens = thinkingConfig ? maxTokens : Math.max(maxTokens, 4096);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: opts.prompt }] }],
          generationConfig: {
            ...opts.generationConfig,
            maxOutputTokens: tokens,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        }),
      });

      if (res.ok) {
        workingThinkingAttempt = i;
        const json = await res.json();
        const candidate = json?.candidates?.[0];
        if (!candidate) {
          const reason = json?.promptFeedback?.blockReason;
          throw new Error(`Geminiから応答が返されませんでした${reason ? `(ブロック理由: ${reason})` : ''}`);
        }
        // 「考えた内容(thought)」は除き、最終的な回答の部分だけをつなげる
        const parts: Array<{ text?: unknown; thought?: boolean }> = candidate.content?.parts ?? [];
        const text = parts
          .filter((p) => !p.thought && typeof p.text === 'string')
          .map((p) => p.text as string)
          .join('');
        result = { text, finishReason: candidate.finishReason };
        break;
      }

      const errText = await res.text().catch(() => '');
      // このモデルが thinking の指定を受け付けない場合(400でthinkingに触れている)は、次の指定で試し直す
      if (res.status === 400 && /thinking/i.test(errText) && i < attempts.length - 1) continue;
      throwGeminiError(res.status, errText);
    }

    if (!result) {
      throw new Error('Geminiの呼び出しに失敗しました');
    }
    if (result.finishReason === 'MAX_TOKENS' && round === 0) {
      maxTokens = Math.min(maxTokens * 2, 32768);
      continue;
    }
    return result;
  }
  throw new Error('Geminiの呼び出しに失敗しました');
}

export interface DifficultyInput {
  word: string;
  mean: string;
  type: 'english' | 'kobun';
}

export async function getDifficultyFromGemini(input: DifficultyInput): Promise<number> {
  const kind = input.type === 'english' ? '英単語' : '古文単語';
  const prompt = `あなたは日本の大学受験生向け${kind}学習アプリの難易度判定AIです。
次の${kind}について、日本の大学受験生（偏差値55~65）が覚える際の難易度を1〜5の整数で判定してください。
1: とても簡単・基礎的
3: 標準的
5: とても難しい・発展的
単語: ${input.word}
意味: ${input.mean}
出力は半角数字1文字(1〜5)のみとし、それ以外の文字(説明・記号・改行)は一切含めないでください。`;

  const { text, finishReason } = await callGemini({
    prompt,
    generationConfig: { temperature: 0, maxOutputTokens: 64 },
    thinking: 'minimal',
  });

  const match = text.match(/[1-5]/);
  if (!match) {
    throw new Error(
      `Geminiの応答から難易度(1〜5)を読み取れませんでした(finishReason: ${finishReason ?? '不明'}): "${text}"`
    );
  }
  return parseInt(match[0], 10);
}

// --- 長文読解問題の生成 ---

export interface PassageWord {
  word: string;
  mean: string;
}

export interface PassageQuestion {
  question: string;
  choices: string[];
  answer_index: number; // choicesの正解インデックス(0始まり)
  explanation: string;
}

export interface GeneratedPassage {
  title: string;
  passage: string;
  used_words: string[];
  questions: PassageQuestion[];
  // 以下はGeminiではなくAPIルート側で、本文を調べて付け足す(選択した単語のうち、どれだけ使われたか)
  selected_count?: number;
  used_count?: number;
  unused_word_ids?: string[];
}

function extractJson(text: string): string {
  // ```json ... ``` のようなコードフェンスを取り除く
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export async function generateEnglishPassage(
  words: PassageWord[]
): Promise<GeneratedPassage> {
  if (words.length === 0) {
    throw new Error('単語が指定されていません');
  }

  const wordList = words.map((w) => `- ${w.word}(${w.mean})`).join('\n');

  const prompt = `あなたは日本の大学受験生向け英語教材の作成AIです。
次の単語リストを「使ってよい単語の候補」として、日本の大学受験生（偏差値55~65）が読む長文読解問題を作成してください。

単語リスト:
${wordList}

単語の使い方(重要):
- 単語リストの単語を全部使う必要はありません。文章が自然で、質の高い長文になる範囲で、使えるだけ多くの単語を使ってください
- 無理に詰め込んで不自然な英文になるくらいなら、使わない単語があっても構いません。ただし、使える単語は積極的に使ってください
- 1つの単語は1回使えば十分です。同じ単語を何度も使うより、できるだけ多くの種類の単語を使うことを優先してください
- 使う単語は、文中でそのまま(必要なら活用変化させて)使用すること
- used_words には、本文で実際に使った単語だけを、単語リストの表記のままで入れること。使わなかった単語は絶対に入れないこと

要件:
- 英文(passage)は500〜800語程度で、偏差値60以上の大学を受験する受験生が読むべき難易度にすること
- 内容理解を問う4〜5問の選択式問題(questions)を作ること。各問題は4択とし、正解は1つ
- 問題文(question)と選択肢(choices)、解説(explanation)は全て日本語で書くこと
- 出力は次のJSON形式のみとし、それ以外の文字列(説明文やコードフェンス)は一切含めないこと

出力形式(JSON):
{
  "title": "長文のタイトル(日本語)",
  "passage": "英語の長文本文",
  "used_words": ["実際に使用した単語1", "単語2", ...],
  "questions": [
    {
      "question": "設問文(日本語)",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "answer_index": 0,
      "explanation": "解説(日本語)"
    }
  ]
}`;

  const { text, finishReason } = await callGemini({
    prompt,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 12000,
      // Geminiにネイティブでこの形のJSONだけを返させる(コードフェンスや前置き文が混ざらない)
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          passage: { type: 'string' },
          used_words: { type: 'array', items: { type: 'string' } },
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string' },
                choices: { type: 'array', items: { type: 'string' } },
                answer_index: { type: 'integer' },
                explanation: { type: 'string' },
              },
              required: ['question', 'choices', 'answer_index', 'explanation'],
            },
          },
        },
        required: ['title', 'passage', 'used_words', 'questions'],
      },
    },
    thinking: 'low',
  });

  if (!text) {
    throw new Error(
      `Geminiから本文が返されませんでした(finishReason: ${finishReason ?? '不明'})。単語数を減らして再試行してください。`
    );
  }

  let parsed: GeneratedPassage;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    // 応答が長すぎて途中で切れた場合、finishReasonが'MAX_TOKENS'になる
    const reasonHint =
      finishReason === 'MAX_TOKENS'
        ? '(応答が長すぎて途中で切れた可能性があります。選択する単語数を減らして再試行してください)'
        : '';
    throw new Error(
      `Geminiの応答をJSONとして解析できませんでした(finishReason: ${finishReason ?? '不明'})${reasonHint}: "${text.slice(0, 300)}..."`
    );
  }

  if (!parsed.passage || !Array.isArray(parsed.questions)) {
    throw new Error('Geminiの応答に必要な項目(passage, questions)が含まれていません');
  }

  return parsed;
}

// --- 単語登録時の自動翻訳 ---
// 管理画面で単語(word)だけを入力したとき、意味(mean)・発音記号(phonetic)を
// Geminiに自動生成させるための関数。
// - english: word=英単語 → mean=日本語訳、phonetic=発音記号(IPA)
// - kobun:   word=古語   → mean=現代語訳、phonetic=null(古語には発音記号がないため)

export interface TranslationInput {
  word: string;
  type: WordSetType;
}

export interface TranslationResult {
  mean: string;
  phonetic: string | null;
}

export async function getTranslationFromGemini(
  input: TranslationInput
): Promise<TranslationResult> {
  const prompt =
    input.type === 'english'
      ? `あなたは日本の大学受験生（偏差値55~65）向け英単語学習アプリの翻訳AIです。
次の英単語について、日本語訳(意味)と発音記号(IPA)を答えてください。

英単語: ${input.word}

出力は次のJSON形式のみとし、それ以外の文字列(説明文やコードフェンス)は一切含めないでください。
意味は日本語で、最も一般的なものを1つ、簡潔に(名詞なら名詞、動詞なら動詞の訳のみなど)書いてください。
発音記号が分からない場合は phonetic を null にしてください。

{
  "mean": "日本語の意味",
  "phonetic": "発音記号(スラッシュなし。例: əˈbaʊt)"
}`
      : `あなたは日本の大学受験生（偏差値55~65）向け古文単語学習アプリの翻訳AIです。
次の古語(古文単語)について、現代語訳を答えてください。

古語: ${input.word}

出力は次のJSON形式のみとし、それ以外の文字列(説明文やコードフェンス)は一切含めないでください。
現代語訳は最も一般的なものを1つ、簡潔に書いてください。phoneticは常にnullにしてください。

{
  "mean": "現代語訳",
  "phonetic": null
}`;

  const { text, finishReason } = await callGemini({
    prompt,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      // 必ずJSONで返させる(コードフェンスや前置き文が混ざらない)
      responseMimeType: 'application/json',
    },
    thinking: 'minimal',
  });

  let parsed: { mean?: string; phonetic?: string | null };
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error(
      `Geminiの応答をJSONとして解析できませんでした(finishReason: ${finishReason ?? '不明'}): "${text.slice(0, 200)}..."`
    );
  }

  if (!parsed.mean) {
    throw new Error('Geminiの応答に意味(mean)が含まれていません');
  }

  return {
    mean: parsed.mean,
    phonetic: parsed.phonetic ?? null,
  };
}
