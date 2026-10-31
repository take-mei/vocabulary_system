'use client';

import { useEffect, useMemo, useState } from 'react';
import NavHeader from '@/components/NavHeader';
import WordList, { WordView } from '@/components/WordList';
import { Word, WordSet } from '@/lib/types';

const VIEW_KEY = 'wordapp:list-view'; // 設定画面の単語一覧と、表示形式の好みを共有する

export default function CheckedPage() {
  const [words, setWords] = useState<Word[]>([]);
  const [sets, setSets] = useState<WordSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<WordView>('card');
  const [setFilter, setSetFilter] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);

  // 前回選んだ表示形式を思い出す
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === 'card' || saved === 'list') setView(saved);
    } catch {
      // localStorageが使えなくても動くようにする
    }
  }, []);

  function changeView(next: WordView) {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // 保存できなくても表示は切り替える
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const [wordRes, setRes] = await Promise.all([
          fetch('/api/words?checked=true'),
          fetch('/api/sets'),
        ]);
        if (!wordRes.ok || !setRes.ok) throw new Error('fetch failed');
        const wordJson = await wordRes.json();
        const setJson = await setRes.json();
        setWords(wordJson.data as Word[]);
        setSets(setJson.data as WordSet[]);
      } catch {
        setError('チェックした単語を読み込めませんでした。通信状況を確認して、もう一度開いてください。');
      }
      setLoading(false);
    })();
  }, []);

  const setById = useMemo(() => {
    const m = new Map<string, WordSet>();
    sets.forEach((s) => m.set(s.id, s));
    return m;
  }, [sets]);

  // チェックした単語がある単語帳だけを、絞り込みの選択肢にする
  const setOptions = useMemo(() => {
    const counts = new Map<string, number>();
    words.forEach((w) => counts.set(w.set_id, (counts.get(w.set_id) ?? 0) + 1));
    return Array.from(counts.entries()).map(([id, count]) => ({
      id,
      name: setById.get(id)?.name ?? '(不明な単語帳)',
      count,
    }));
  }, [words, setById]);

  const filtered = useMemo(
    () => (setFilter === 'all' ? words : words.filter((w) => w.set_id === setFilter)),
    [words, setFilter]
  );

  // 絞り込み中の単語帳のチェックが全部なくなったら「すべて」に戻す
  useEffect(() => {
    if (setFilter !== 'all' && !words.some((w) => w.set_id === setFilter)) setSetFilter('all');
  }, [words, setFilter]);

  // 一覧での操作の反映。チェックを外した単語は、この画面の一覧から消す
  function handleChange(updated: Word) {
    setWords((ws) =>
      updated.checked
        ? ws.map((w) => (w.id === updated.id ? { ...w, ...updated } : w))
        : ws.filter((w) => w.id !== updated.id)
    );
  }

  function handleRemove(id: string) {
    setWords((ws) => ws.filter((w) => w.id !== id));
  }

  async function uncheckAllShown() {
    if (filtered.length === 0) return;
    const target = setFilter === 'all' ? 'すべて' : `「${setById.get(setFilter)?.name ?? ''}」`;
    if (!confirm(`${target}のチェックを全部外しますか？(${filtered.length}語。単語そのものは消えません)`)) return;

    const ids = filtered.map((w) => w.id);
    const previous = words;
    setWords((ws) => ws.filter((w) => !ids.includes(w.id)));
    setError(null);
    try {
      const res = await fetch('/api/words/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, checked: false }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setWords(previous); // 失敗したら元に戻す
      setError('チェックを外せませんでした。通信状況を確認して、もう一度お試しください。');
    }
  }

  return (
    <main>
      <NavHeader />
      <h1 className="mb-1 text-xl font-bold">★ チェックした単語</h1>
      <p className="mb-4 text-sm text-gray-500">
        出題画面のカード左上の ☆ を押した単語が、ここにたまります。ここからも、編集・アーカイブ・削除ができます。
      </p>

      {loading && <p className="text-gray-400">読み込み中...</p>}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {!loading && !error && words.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          まだチェックした単語がありません。
          <br />
          出題中のカード左上の ☆ を押すと、ここで見返せます。
        </div>
      )}

      {!loading && words.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {/* 表示形式 */}
            <div className="inline-flex overflow-hidden rounded-xl ring-1 ring-gray-300">
              {(['card', 'list'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => changeView(v)}
                  className={`px-4 py-1.5 text-sm font-semibold ${
                    view === v ? 'bg-primary-600 text-white' : 'bg-white text-gray-600'
                  }`}
                >
                  {v === 'card' ? 'カード' : 'リスト'}
                </button>
              ))}
            </div>

            {/* 単語帳で絞り込み */}
            <select
              value={setFilter}
              onChange={(e) => setSetFilter(e.target.value)}
              className="rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="all">すべての単語帳({words.length})</option>
              {setOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}({o.count})
                </option>
              ))}
            </select>

            {view === 'card' && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="rounded-xl bg-white px-3 py-1.5 text-sm text-gray-600 ring-1 ring-gray-300"
              >
                {showAll ? '答えを隠す' : '答えをすべて表示'}
              </button>
            )}

            <button onClick={uncheckAllShown} className="ml-auto text-xs text-red-500 hover:underline">
              表示中のチェックを全部外す
            </button>
          </div>

          <p className="mb-3 text-xs text-gray-400">{filtered.length}語</p>

          <WordList
            words={filtered}
            view={view}
            typeOf={(w) => setById.get(w.set_id)?.type}
            showTypeBadge
            hideMeaning
            revealAll={showAll}
            onChange={handleChange}
            onRemove={handleRemove}
          />
        </>
      )}
    </main>
  );
}
