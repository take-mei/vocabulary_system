// ブラウザ標準のWeb Speech API(音声合成)を使って単語を読み上げる。
// 音声ファイルの生成・保存は行わず、その場で再生する軽量な実装。
export function speak(text: string, lang: 'en-US' | 'ja-JP') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // 前の発話が残っていたら止める
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}
