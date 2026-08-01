'use client';

import { Word } from '@/lib/types';

export default function FlashCard({
  word,
  frontText,
  backText,
  remarks,
  flipped,
  onFlip,
}: {
  word: Word;
  frontText: string;
  backText: string;
  remarks: string | null;
  flipped: boolean;
  onFlip: () => void;
}) {
  return (
    <div className="card-flip-container mx-auto h-64 w-full max-w-sm">
      <div
        className={`card-flip-inner relative h-full w-full cursor-pointer ${
          flipped ? 'flipped' : ''
        }`}
        onClick={onFlip}
      >
        <div className="card-face absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white p-6 text-center shadow-lg ring-1 ring-black/5">
          <p className="text-2xl font-bold leading-snug">{frontText}</p>
          <p className="mt-4 text-xs text-gray-400">タップして答えを見る</p>
        </div>
        <div className="card-face card-face-back absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-primary-600 p-6 text-center text-white shadow-lg">
          <p className="text-2xl font-bold leading-snug">{backText}</p>
          {remarks && (
            <p className="mt-3 max-h-16 overflow-y-auto text-sm text-primary-100">
              {remarks}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
