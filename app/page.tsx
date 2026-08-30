'use client';

import Link from 'next/link';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { WordSet, MODES_BY_TYPE, MODE_LABELS } from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import TranslateBox from '@/components/TranslateBox';
import { downloadSetForOffline, getOfflineSet } from '@/lib/offlineStore';

export default function HomePage() {
  const router = useRouter();
  const [sets, setSets] = useState<WordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSetId, setOpenSetId] = useState<string | null>(null);
  const [downloadedAt, setDownloadedAt] = useState<Record<string, string>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  function refreshDownloadStatus(list: WordSet[]) {
    const map: Record<string, string> = {};
    list.forEach((s) => {
      const offline = getOfflineSet(s.id);
      if (offline) map[s.id] = offline.downloadedAt;
    });
    setDownloadedAt(map);
  }

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('word_sets')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setSets(data as WordSet[]);
        refreshDownloadStatus(data as WordSet[]);
      }
      setLoading(false);
    })();
  }, []);

  async function handleDownload(setId: string) {
    setDownloadingId(setId);
    const result = await downloadSetForOffline(setId);
    if (!result.ok) {
      alert(`ダウンロードに失敗しました: ${result.error}`);
    } else {
      refreshDownloadStatus(sets);
    }
    setDownloadingId(null);
  }

  return (
    <main>
      <NavHeader />

      <TranslateBox />

      <h1 className="mb-1 text-xl font-bold">単語帳を選ぶ</h1>
      <p className="mb-5 text-sm text-gray-500">
        単語帳をタップして、出題モードを選んでください。Wi-Fiがある時に「オフライン用にダウンロード」しておくと、電波が悪い場所でも学習できます。
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
          const downloaded = downloadedAt[set.id];
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
                    <p className="mt-0.5 text-xs text-gray-500">{set.description}</p>
                  )}
                </div>
                <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
              </button>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Link
                  href={`/test/${set.id}`}
                  className="text-xs text-gray-500 hover:text-primary-600 hover:underline"
                >
                  📝 アーカイブからテスト作成
                </Link>
                <button
                  onClick={() => handleDownload(set.id)}
                  disabled={downloadingId === set.id}
                  className="text-xs text-sky-600 hover:underline disabled:opacity-50"
                >
                  {downloadingId === set.id
                    ? 'ダウンロード中...'
                    : downloaded
                    ? `📥 更新する(${new Date(downloaded).toLocaleDateString('ja-JP')}時点)`
                    : '📥 オフライン用にダウンロード'}
                </button>
              </div>

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
