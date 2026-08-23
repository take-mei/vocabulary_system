// Gemini APIを使って単語の難易度(1〜5)を判定するヘルパー。
// このファイルはサーバー側(APIルート)からのみ呼び出すこと。GEMINI_API_KEYを外部に渡さない。

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

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
  const prompt = `あなたは日本の高校生向け${kind}学習アプリの難易度判定AIです。
次の${kind}について、日本の高校生が覚える際の難易度を1〜5の整数で判定してください。
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

  const prompt = `あなたは日本の高校生向け英語教材の作成AIです。
次の単語リストのうち、できるだけ多くの単語を自然な形で使った、日本の高校生が読む長文読解問題を作成してください。

単語リスト:
${wordList}

要件:
- 英文(passage)は150〜250語程度で、高校生が読める難易度にすること
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
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini APIエラー(${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text?.toString() ?? '';

  let parsed: GeneratedPassage;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    throw new Error(`Geminiの応答をJSONとして解析できませんでした: "${text.slice(0, 200)}..."`);
  }

  if (!parsed.passage || !Array.isArray(parsed.questions)) {
    throw new Error('Geminiの応答に必要な項目(passage, questions)が含まれていません');
  }

  return parsed;
}
