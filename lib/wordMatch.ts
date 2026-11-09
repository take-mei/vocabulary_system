// 選択した単語のうち、本文で実際に使われたものを調べる(目安)。サーバー・ブラウザの両方で使う純粋な関数。
// Geminiの申告(used_words)だけに頼らず、本文に単語(活用変化を含む)が現れるかを確認する。

export function normalizeWord(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[~〜….?!,;:"“”]/g, ' ')
    .replace(/^to\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function partAppears(part: string, text: string): boolean {
  if (!/^[a-z'-]+$/.test(part)) {
    // 英字以外(記号・数字など)を含む語は、そのままの形で探す
    return text.includes(part);
  }
  let pattern: string;
  if (part.length <= 4) {
    // 短い語は別の語に誤って一致しないよう、代表的な語尾変化だけを許す
    pattern = `\\b${escapeRegExp(part)}(?:s|es|ed|d|ing)?\\b`;
    if (part.endsWith('e')) pattern += `|\\b${escapeRegExp(part.slice(0, -1))}ing\\b`;
  } else {
    // 長い語は語幹(末尾2文字を除いた部分)が一致すれば、活用変化・派生語も使われたとみなす
    const stem = part.slice(0, Math.max(4, part.length - 2));
    pattern = `\\b${escapeRegExp(stem)}\\w*`;
  }
  return new RegExp(pattern, 'i').test(text);
}

export function wordAppearsInText(word: string, text: string): boolean {
  const parts = normalizeWord(word).split(/[\s/]+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => partAppears(p, text));
}
