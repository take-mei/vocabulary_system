// Gemini APIを使って単語の難易度(1〜5)を判定するヘルパー。
// このファイルはサーバー側(APIルート)からのみ呼び出すこと。GEMINI_API_KEYを外部に渡さない。

// 注: gemini-2.0-flash は廃止(シャットダウン済み)のため gemini-2.5-flash をデフォルトに変更。
// GEMINI_MODEL 環境変数で上書き可能。
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

export interface DifficultyInput {
  word: string;
  mean: string;
  type: 'english' | 'kobun';
}

export async function getDifficultyFromGemini(
  input: DifficultyInput
): Promise<number> {
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
  const text: string =
    json?.candidates?.[0]?.content?.parts?.[0]?.text?.toString() ?? '';
  const match = text.match(/[1-5]/);

  if (!match) {
    throw new Error(
      `Geminiの応答から難易度(1〜5)を読み取れませんでした: "${text}"`
    );
  }

  return parseInt(match[0], 10);
}
