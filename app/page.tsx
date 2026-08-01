'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { WordSet, MODES_BY_TYPE, MODE_LABELS } from '@/lib/types';
import NavHeader from '@/components/NavHeader';

export default function HomePage() {
  const router = useRouter();
  const [sets, setSets] = useState<WordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSetId, setOpenSetId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('word_sets')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setSets(data as WordSet[]);
      setLoading(false);
    })();
  }, []);

  return (
    <main>
      <NavHeader />
      <h1 className="mb-1 text-xl font-bold">単語帳を選ぶ</h1>
      <p className="mb-5 text-sm text-gray-500">
        単語帳をタップして、出題モードを選んでください。
      </p>

      {loading && <p className="text-gray-400">読み込み中...</p>}

      {!loading && sets.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          まだ単語帳がありません。
          <br />
          <span className="text-primary-600">管理者画面</span>
          から単語帳と単語を登録してください。
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sets.map((set) => {
          const isOpen = openSetId === set.id;
          const modes = MODES_BY_TYPE[set.type];
          return (
            <div
              key={set.id}
              className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:shadow-md"
            >
              <button
                onClick={() => setOpenSetId(isOpen ? null : set.id)}
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        set.type === 'english'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {set.type === 'english' ? '英単語' : '古文単語'}
                    </span>
                  </div>
                  <h2 className="mt-1 font-bold">{set.name}</h2>
                  {set.description && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {set.description}
                    </p>
                  )}
                </div>
                <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {modes.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => router.push(`/quiz/${set.id}/${mode}`)}
                      className="rounded-xl bg-primary-600 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 active:scale-95"
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
