// 年(西暦・任意)の入力を検証する。空なら null、不正なら undefined、正しければ数値。
export function parseYear(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < 1900 || n > 2100) return undefined;
  return n;
}
