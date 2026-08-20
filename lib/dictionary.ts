// 無料の辞書API(dictionaryapi.dev)を使って英単語の発音記号(IPA)を取得する。
// APIキー不要。古文単語(kobun)には対応していない。

export async function getPhoneticFromDictionaryApi(
  word: string
): Promise<string | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
    word.trim()
  )}`;

  const res = await fetch(url);
  if (!res.ok) {
    // 見つからない単語(活用形・古語など)はnullを返すだけにする
    return null;
  }

  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) return null;

  // phoneticフィールド、または phonetics配列内のtextを探す
  for (const entry of json) {
    if (entry.phonetic) return entry.phonetic as string;
    if (Array.isArray(entry.phonetics)) {
      const withText = entry.phonetics.find((p: any) => p.text);
      if (withText?.text) return withText.text as string;
    }
  }

  return null;
}
