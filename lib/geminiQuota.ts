// Gemini APIの無料枠(1日あたりのリクエスト数上限)に収まるよう、
// ブラウザのlocalStorageで「今日already何回呼んだか」を記録しておくための仕組み。
//
// 注意: これはこのブラウザ内だけで完結する自己申告のカウンタであり、
// Google側の実際のクォータ(APIキー単位)そのものを参照しているわけではない。
// 同じGEMINI_API_KEYを複数の端末・ブラウザから使っている場合は、
// 実際の上限に達するタイミングとズレる可能性がある(その場合はサーバー側の429を
// 検知して即中断する仕組み(lib/gemini.ts, 各APIルート)が最終的な安全網になる)。

export const GEMINI_DAILY_LIMIT = 20;

const KEY_PREFIX = 'wordapp:gemini-quota:';

function hasWindow(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function todayKey(): string {
  const d = new Date();
  return `${KEY_PREFIX}${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// 前日以前のカウンタは不要なので削除しておく(localStorageが肥大化しないように)
function cleanupOldEntries() {
  if (!hasWindow()) return;
  const keep = todayKey();
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && key.startsWith(KEY_PREFIX) && key !== keep) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((key) => window.localStorage.removeItem(key));
}

export function getGeminiUsageToday(): number {
  if (!hasWindow()) return 0;
  cleanupOldEntries();
  return parseInt(window.localStorage.getItem(todayKey()) ?? '0', 10);
}

export function getGeminiRemainingToday(limit: number = GEMINI_DAILY_LIMIT): number {
  return Math.max(limit - getGeminiUsageToday(), 0);
}

export function recordGeminiUsage(count: number = 1) {
  if (!hasWindow()) return;
  const current = getGeminiUsageToday();
  window.localStorage.setItem(todayKey(), String(current + count));
}
