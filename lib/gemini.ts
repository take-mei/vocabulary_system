// Gemini APIを使って単語の難易度(1〜5)を判定するヘルパー。
// このファイルはサーバー側(APIルート)からのみ呼び出すこと。GEMINI_API_KEYを外部に渡さない。

import { WordSetType } from '@/lib/types';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export interface DifficultyInput {
  word: string;
  mean: string;
  type: 'english' | 'kobun';
}

export async function getDifficultyFromGemini(input: DifficultyInput): Promise<number> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('環境変数 GEMINI_API_KEY が設定されていません');
  }

  const kind = input.type === 'english' ? '英単語' : '古文単語';
  const prompt = `あなたは日本の大学受験生向け${kind}学習アプリの難易度判定AIです。
次の${kind}について、日本の大学受験生（偏差値55~65）が覚える際の難易度を1〜5の整数で判定してください。
1: とても簡単・基礎的
3: 標準的
5: とても難しい・発展的
単語: ${input.word}
意味: ${input.mean}
出力は半角数字1文字(1〜5)のみとし、それ以外の文字(説明・記号・改行)は一切含めないでください。`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini APIエラー(${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text?.toString() ?? '';
  const match = text.match(/[1-5]/);
  if (!match) {
    throw new Error(`Geminiの応答から難易度(1〜5)を読み取れませんでした: "${text}"`);
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
}

function extractJson(text: string): string {
  // ```json ... ``` のようなコードフェンスを取り除く
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

export async function generateEnglishPassage(
  words: PassageWord[]
): Promise<GeneratedPassage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('環境変数 GEMINI_API_KEY が設定されていません');
  }
  if (words.length === 0) {
    throw new Error('単語が指定されていません');
  }

  const wordList = words.map((w) => `- ${w.word}(${w.mean})`).join('\n');

  const prompt = `あなたは日本の大学受験生向け英語教材の作成AIです。
次の単語リストのうち、できるだけ多くの単語を自然な形で使った、日本の大学受験生（偏差値55~65）が読む長文読解問題を作成してください。

単語リスト:
${wordList}

要件:
- 英文(passage)は500〜800語程度で、偏差値60以上の大学を受験する受験生が読むべき難易度にすること
- 単語リストの単語は文中でそのまま(必要なら活用変化させて)使用すること
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        // Geminiにネイティブでこの形のJSONだけを返させる(コードフェンスや前置き文が混ざらず、
        // 途中で応答が切れて壊れたJSONになる問題も軽減できる)
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
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini APIエラー(${res.status}): ${errText}`);
  }

  const json = await res.json();
  const candidate = json?.candidates?.[0];
  const text: string = candidate?.content?.parts?.[0]?.text?.toString() ?? '';
  const finishReason: string | undefined = candidate?.finishReason;

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
      `Geminiの応答をJSONとして解析できませんでした${reasonHint}: "${text.slice(0, 300)}..."`
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('環境変数 GEMINI_API_KEY が設定されていません');
  }

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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini APIエラー(${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text?.toString() ?? '';

  let parsed: { mean?: string; phonetic?: string | null };
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error(`Geminiの応答をJSONとして解析できませんでした: "${text.slice(0, 200)}..."`);
  }

  if (!parsed.mean) {
    throw new Error('Geminiの応答に意味(mean)が含まれていません');
  }

  return {
    mean: parsed.mean,
    phonetic: parsed.phonetic ?? null,
  };
}
