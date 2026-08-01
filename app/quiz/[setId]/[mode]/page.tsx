'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { QuizMode, Word, WordSet, MODE_LABELS } from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import FlashCard from '@/components/FlashCard';

const FRONT_IS_WORD: QuizMode[] = ['en_to_jp', 'ko_to_gen'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizPage() {
  const router = useRouter();
  const params = useParams<{ setId: string; mode: string }>();
  const setId = params.setId;
  const mode = params.mode as QuizMode;

  const [set, setSet] = useState<WordSet | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ correct: number; wrong: number }>({
    correct: 0,
    wrong: 0,
  });
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: setData }, { data: wordData }] = await Promise.all([
        supabase.from('word_sets').select('*').eq('id', setId).single(),
        supabase.from('words').select('*').eq('set_id', setId),
      ]);
      if (setData) setSet(setData as WordSet);
      if (wordData) setWords(shuffle(wordData as Word[]));
      setLoading(false);
    })();
  }, [setId]);

  const current = words[index];
  const frontIsWord = FRONT_IS_WORD.includes(mode);

  const frontText = current ? (frontIsWord ? current.word : current.mean) : '';
  const backText = current ? (frontIsWord ? current.mean : current.word) : '';

  const progressPct = useMemo(
    () => (words.length ? Math.round(((index + 1) / words.length) * 100) : 0),
    [index, words.length]
  );

  async function recordAndNext(isCorrect: boolean) {
    if (!current) return;
    setResults((r) => ({
      correct: r.correct + (isCorrect ? 1 : 0),
      wrong: r.wrong + (isCorrect ? 0 : 1),
    }));

    // 学習ログを記録(失敗しても学習体験は止めない)
    supabase
      .from('study_logs')
      .insert({
        word_id: current.id,
        set_id: setId,
        mode,
        is_correct: isCorrect,
      })
      .then(() => {});

    if (index + 1 >= words.length) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  }

  function restart() {
    setWords((w) => shuffle(w));
    setIndex(0);
    setFlipped(false);
    setResults({ correct: 0, wrong: 0 });
    setFinished(false);
  }

  return (
    <main>
      <NavHeader />
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="text-sm text-gray-500 hover:underline"
        >
          ← 単語帳選択に戻る
        </button>
        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
          {MODE_LABELS[mode]}
        </span>
      </div>

      {set && <h1 className="mb-4 text-lg font-bold">{set.name}</h1>}

      {loading && <p className="text-gray-400">読み込み中...</p>}

      {!loading && words.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          この単語帳にはまだ単語が登録されていません。
        </div>
      )}

      {!loading && words.length > 0 && !finished && (
        <>
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-primary-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mb-3 text-center text-sm text-gray-500">
            {index + 1} / {words.length}
          </p>

          <FlashCard
            word={current}
            frontText={frontText}
            backText={backText}
            remarks={current.remarks}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
          />

          {flipped ? (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => recordAndNext(false)}
                className="rounded-xl bg-red-500 py-3 font-semibold text-white transition active:scale-95"
              >
                ✕ わからなかった
              </button>
              <button
                onClick={() => recordAndNext(true)}
                className="rounded-xl bg-green-600 py-3 font-semibold text-white transition active:scale-95"
              >
                ○ わかった
              </button>
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-gray-400">
              カードをタップして答えを確認してください
            </p>
          )}
        </>
      )}

      {finished && (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <h2 className="mb-2 text-xl font-bold">おつかれさまでした！</h2>
          <p className="mb-4 text-gray-500">
            正解 {results.correct} / {words.length}
            (正答率{' '}
            {words.length
              ? Math.round((results.correct / words.length) * 100)
              : 0}
            %)
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={restart}
              className="rounded-xl bg-primary-600 px-5 py-2 font-semibold text-white"
            >
              もう一度
            </button>
            <button
              onClick={() => router.push('/')}
              className="rounded-xl bg-gray-200 px-5 py-2 font-semibold text-gray-700"
            >
              単語帳選択に戻る
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
