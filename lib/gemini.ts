// Gemini APIを使って単語の難易度(1〜5)を判定するヘルパー。
// このファイルはサーバー側(APIルート)からのみ呼び出すこと。GEMINI_API_KEYを外部に渡さない。

// 注: gemini-2.0-flash は廃止(シャットダウン済み)、gemini-2.5-flash も新規ユーザー向け提供終了のため
// 現行の安定版 gemini-3.6-flash をデフォルトに変更。GEMINI_MODEL 環境変数で上書き可能。
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// 無料枠は「1分あたりのリクエスト数」に上限がある(モデルによって異なる。既定は5件/分)。
// GEMINI_RPM 環境変数で上書き可能(有料プランなど上限が高い場合はここを増やす)。
const RPM_LIMIT = Number(process.env.GEMINI_RPM) || 5;
const RETRY_LIMIT = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 直近60秒間に送ったリクエストのタイムスタンプ。件数に応じて必要な分だけ自動で待つ
// (少ない件数なら待たない/多い件数ならレート上限に合わせて自動的に間隔を空ける)。
const requestTimestamps: number[] = [];

async function waitForRateLimitSlot(): Promise<void> {
  const now = Date.now();
  while (requestTimestamps.length && now - requestTimestamps[0] >= 60_000) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RPM_LIMIT) {
    const waitMs = 60_000 - (now - requestTimestamps[0]) + 250; // 余裕を持たせる
    await sleep(Math.max(waitMs, 0));
    return waitForRateLimitSlot();
  }
  requestTimestamps.push(Date.now());
}

// 実際に枠を消費せず「今リクエストしたら何ms待つ必要があるか」だけを確認する。
// バッチ処理側が「残り時間内に収まらないから今回はここで打ち切る」と判断するために使う。
export function peekRateLimitWaitMs(): number {
  const now = Date.now();
  const active = requestTimestamps.filter((t) => now - t < 60_000);
  if (active.length < RPM_LIMIT) return 0;
  return Math.max(60_000 - (now - active[0]) + 250, 0);
}

// Geminiの429レスポンスに含まれる "Please retry in 18.08s" / retryDelay: "18s" を読み取る
function parseRetryDelayMs(errText: string): number | null {
  const retryDelayMatch = errText.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (retryDelayMatch) return Math.ceil(parseFloat(retryDelayMatch[1]) * 1000);
  const retryInMatch = errText.match(/retry in (\d+(?:\.\d+)?)s/);
  if (retryInMatch) return Math.ceil(parseFloat(retryInMatch[1]) * 1000);
  return null;
}

// Gemini APIへの共通呼び出し処理(レート制限待ち・429自動リトライ込み)。
// prompt(指示文)とmaxOutputTokensだけ渡せば、応答テキストを返す。
async function callGeminiText(
  prompt: string,
  maxOutputTokens: number,
  attempt = 0
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('環境変数 GEMINI_API_KEY が設定されていません');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  await waitForRateLimitSlot();

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        // Gemini 3系はデフォルトで「thinking」が有効(最大8192トークン)なため、
        // thinkingLevelをminimalにしないとmaxOutputTokensが思考に消費され本文が空になる。
        thinkingConfig: { thinkingLevel: 'minimal' },
        maxOutputTokens,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');

    // 429(レート制限)はAPIが教えてくれる待ち時間分だけ待って自動リトライする
    if (res.status === 429 && attempt < RETRY_LIMIT) {
      const retryDelayMs = parseRetryDelayMs(errText) ?? 15_000;
      await sleep(retryDelayMs + 500);
      return callGeminiText(prompt, maxOutputTokens, attempt + 1);
    }

    throw new Error(`Gemini APIエラー(${res.status}): ${errText}`);
  }

  const json = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.[0]?.text?.toString() ?? '';
  return text;
}

export interface DifficultyInput {
  word: string;
  mean: string;
  type: 'english' | 'kobun';
}

export async function getDifficultyFromGemini(
  input: DifficultyInput
): Promise<number> {
  const kind = input.type === 'english' ? '英単語' : '古文単語';
  const prompt = `あなたは日本の高校生向け${kind}学習アプリの難易度判定AIです。
次の${kind}について、日本の高校生が覚える際の難易度を1〜5の整数で判定してください。
1: とても簡単・基礎的
3: 標準的
5: とても難しい・発展的
単語: ${input.word}
意味: ${input.mean}
出力は半角数字1文字(1〜5)のみとし、それ以外の文字(説明・記号・改行)は一切含めないでください。`;

  const text = await callGeminiText(prompt, 32);
  const match = text.match(/[1-5]/);

  if (!match) {
    throw new Error(
      `Geminiの応答から難易度(1〜5)を読み取れませんでした: "${text}"`
    );
  }

  return parseInt(match[0], 10);
}

export interface TranslateInput {
  word: string;
  type: 'english' | 'kobun';
}

export interface TranslateResult {
  mean: string;
  phonetic: string | null; // 発音記号(IPA)。英単語のみ生成。古文単語は常にnull
}

// 単語(英単語 or 古文単語)を入力すると、意味(mean)と(英単語なら)発音記号を自動生成する翻訳機能。
export async function getTranslationFromGemini(
  input: TranslateInput
): Promise<TranslateResult> {
  const prompt =
    input.type === 'english'
      ? `あなたは日本の高校生向け英単語学習アプリの翻訳AIです。
次の英単語について、JSON形式で出力してください。
{"mean": "日本語の意味(単語帳の「意味」欄に入る程度、10〜20文字程度。複数ある場合は代表的なものを「、」区切りで2〜3個)", "phonetic": "国際音声記号(IPA)による発音記号。スラッシュ(/.../)で囲む"}
英単語: ${input.word}
出力は上記のJSONオブジェクトのみとし、コードブロック記号(\`\`\`)や説明文、前後の余計な文字は一切含めないでください。`
      : `あなたは日本の高校生向け古文単語学習アプリの翻訳AIです。
次の古文単語(古典日本語)について、JSON形式で出力してください。
{"mean": "現代語訳(単語帳の「意味」欄に入る程度、10〜20文字程度。複数ある場合は代表的なものを「、」区切りで2〜3個)"}
古文単語: ${input.word}
出力は上記のJSONオブジェクトのみとし、コードブロック記号(\`\`\`)や説明文、前後の余計な文字は一切含めないでください。`;

  const text = await callGeminiText(prompt, 128);
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let parsed: { mean?: string; phonetic?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Geminiの応答をJSONとして読み取れませんでした: "${text}"`);
  }

  const mean = (parsed.mean ?? '').trim().replace(/^["「『]|["」』]$/g, '');
  if (!mean) {
    throw new Error('Geminiの応答から意味を読み取れませんでした');
  }

  const phonetic =
    input.type === 'english' && parsed.phonetic ? parsed.phonetic.trim() : null;

  return { mean, phonetic };
}
