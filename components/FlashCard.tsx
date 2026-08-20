'use client';

import { Word } from '@/lib/types';

export default function FlashCard({
  word,
  frontText,
  backText,
  frontPhonetic,
  backPhonetic,
  remarks,
  flipped,
  onFlip,
  onSpeak,
}: {
  word: Word;
  frontText: string;
  backText: string;
  frontPhonetic?: string | null;
  backPhonetic?: string | null;
  remarks: string | null;
  flipped: boolean;
  onFlip: () => void;
  onSpeak: () => void;
}) {
  function handleSpeakClick(e: React.MouseEvent) {
    e.stopPropagation(); // カードのフリップを誘発しないようにする
    onSpeak();
  }

  return (
    <div className="card-flip-container mx-auto h-64 w-full max-w-sm">
      <div
        className={`card-flip-inner relative h-full w-full cursor-pointer ${flipped ? 'flipped' : ''}`}
        onClick={onFlip}
      >
        <div className="card-face absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-black/5">
          <button
            onClick={handleSpeakClick}
            className="absolute right-3 top-3 rounded-full bg-gray-100 p-2 text-lg hover:bg-gray-200 active:scale-95"
            aria-label="発音を再生"
          >
            🔊
          </button>
          <p className="text-2xl font-bold leading-snug">{frontText}</p>
          {frontPhonetic && (
            <p className="mt-1 text-sm text-gray-400">[{frontPhonetic}]</p>
          )}
          <p className="mt-4 text-xs text-gray-400">タップして答えを見る</p>
        </div>
        <div className="card-face card-face-back absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-primary-600 p-6 text-center text-white shadow-lg">
          <button
            onClick={handleSpeakClick}
            className="absolute right-3 top-3 rounded-full bg-white/20 p-2 text-lg hover:bg-white/30 active:scale-95"
            aria-label="発音を再生"
          >
            🔊
          </button>
          <p className="text-2xl font-bold leading-snug">{backText}</p>
          {backPhonetic && (
            <p className="mt-1 text-sm text-primary-100">[{backPhonetic}]</p>
          )}
          {remarks && (
            <p className="mt-3 max-h-16 overflow-y-auto text-sm text-primary-100">{remarks}</p>
          )}
        </div>
      </div>
    </div>
  );
}
