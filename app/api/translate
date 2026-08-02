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
  const [selectedSetId, setSelectedSetId] = useState<string>('');

  // 翻訳機
  const [inputWord, setInputWord] = useState('');
  const [translatedMean, setTranslatedMean] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  // 追加フォーム
  const [remarks, setRemarks] = useState('');
  const [importance, setImportance] = useState(3);
  const [adding, setAdding] = useState(false);
  const [addStatus, setAddStatus] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('word_sets')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        setSets(data as WordSet[]);
        if (data.length > 0) setSelectedSetId(data[0].id);
      }
      setLoading(false);
    })();
  }, []);

  const selectedSet = sets.find((s) => s.id === selectedSetId) ?? null;

  async function handleTranslate() {
    if (!selectedSet || !inputWord.trim()) return;
    setTranslating(true);
    setTranslateError(null);
    setTranslatedMean('');
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: inputWord.trim(), type: selectedSet.type }),
      });
      const json = await res.json();
      if (!res.ok) {
        setTranslateError(json.error ?? '翻訳に失敗しました');
      } else {
        setTranslatedMean(json.mean);
      }
    } catch {
      setTranslateError('通信エラーが発生しました');
    } finally {
      setTranslating(false);
    }
  }

  async function handleAddWord() {
    if (!selectedSet || !inputWord.trim() || !translatedMean.trim()) return;
    setAdding(true);
    setAddStatus(null);
    try {
      const res = await fetch('/api/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          set_id: selectedSet.id,
          word: inputWord.trim(),
          mean: translatedMean.trim(),
          remarks: remarks.trim() || null,
          importance,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAddStatus(`エラー: ${json.error ?? '追加に失敗しました'}`);
      } else {
        setAddStatus(`「${inputWord.trim()}」を「${selectedSet.name}」に追加しました`);
        setInputWord('');
        setTranslatedMean('');
        setRemarks('');
        setImportance(3);
      }
    } catch {
      setAddStatus('通信エラーが発生しました');
    } finally {
      setAdding(false);
    }
  }

  const modes = selectedSet ? MODES_BY_TYPE[selectedSet.type] : [];

  return (
    <main>
      <NavHeader />
      <h1 className="mb-1 text-xl font-bold">ダッシュボード</h1>
      <p className="mb-5 text-sm text-gray-500">
        単語帳を選んで、学習を始めたり単語を追加したりできます。
      </p>

      {loading && <p className="text-gray-400">読み込み中...</p>}

      {!loading && sets.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          まだ単語帳がありません。
          <br />
          <span className="text-primary-600">管理者画面</span>
          から単語帳を作成してください。
        </div>
      )}

      {!loading && sets.length > 0 && (
        <>
          {/* 単語帳選択 */}
          <div className="mb-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <label className="mb-1 block text-xs font-semibold text-gray-500">
              単語帳
            </label>
            <select
              value={selectedSetId}
              onChange={(e) => {
                setSelectedSetId(e.target.value);
                setInputWord('');
                setTranslatedMean('');
                setTranslateError(null);
                setAddStatus(null);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {sets.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.type === 'english' ? '📘' : '📜'} {set.name}
                </option>
              ))}
            </select>

            {selectedSet && (
              <>
                {selectedSet.description && (
                  <p className="mt-2 text-xs text-gray-500">{selectedSet.description}</p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {modes.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => router.push(`/quiz/${selectedSet.id}/${mode}`)}
                      className="rounded-xl bg-primary-600 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 active:scale-95"
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* 翻訳機 & 単語追加 */}
          {selectedSet && (
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <h2 className="mb-3 font-bold">🔤 翻訳機で単語を追加</h2>

              <label className="mb-1 block text-xs font-semibold text-gray-500">
                {selectedSet.type === 'english' ? '英単語' : '古文単語'}
              </label>
              <div className="mb-3 flex gap-2">
                <input
                  value={inputWord}
                  onChange={(e) => {
                    setInputWord(e.target.value);
                    setTranslatedMean('');
                    setTranslateError(null);
                    setAddStatus(null);
                  }}
                  placeholder={selectedSet.type === 'english' ? '例: apple' : '例: あはれなり'}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleTranslate();
                    }
                  }}
                />
                <button
                  onClick={handleTranslate}
                  disabled={translating || !inputWord.trim()}
                  className="whitespace-nowrap rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {translating ? '翻訳中...' : '翻訳する'}
                </button>
              </div>

              {translateError && (
                <p className="mb-3 text-xs text-red-600">{translateError}</p>
              )}

              {translatedMean && (
                <>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">
                    {selectedSet.type === 'english' ? '意味(編集できます)' : '現代語訳(編集できます)'}
                  </label>
                  <input
                    value={translatedMean}
                    onChange={(e) => setTranslatedMean(e.target.value)}
                    className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />

                  <label className="mb-1 block text-xs font-semibold text-gray-500">
                    備考(任意)
                  </label>
                  <input
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="備考(任意)"
                    className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />

                  <label className="mb-1 block text-xs font-semibold text-gray-500">
                    重要度(出題頻度に影響)
                  </label>
                  <select
                    value={importance}
                    onChange={(e) => setImportance(Number(e.target.value))}
                    className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        重要度 {n}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleAddWord}
                    disabled={adding}
                    className="w-full rounded-lg bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {adding ? '追加中...' : `「${selectedSet.name}」に追加`}
                  </button>
                </>
              )}

              {addStatus && (
                <p className="mt-3 text-xs text-gray-600">{addStatus}</p>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
