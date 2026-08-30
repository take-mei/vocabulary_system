'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Word, WordSet, WordSetType } from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import ImportCsv from '@/components/ImportCsv';
import GeminiQuotaBadge from '@/components/GeminiQuotaBadge';
import { GEMINI_DAILY_LIMIT, getGeminiRemainingToday, recordGeminiUsage } from '@/lib/geminiQuota';

type SortKey = 'created_desc' | 'difficulty_desc' | 'difficulty_asc' | 'importance_desc';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function AdminPage() {
  const [sets, setSets] = useState<WordSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingWords, setLoadingWords] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('created_desc');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 新規単語帳フォーム
  const [newSetName, setNewSetName] = useState('');
  const [newSetType, setNewSetType] = useState<WordSetType>('english');
  const [newSetDesc, setNewSetDesc] = useState('');

  // 新規単語フォーム
  const [newWord, setNewWord] = useState('');
  const [newMean, setNewMean] = useState('');
  const [newRemarks, setNewRemarks] = useState('');
  const [newImportance, setNewImportance] = useState(3);

  // 編集中の単語
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editMean, setEditMean] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editImportance, setEditImportance] = useState(3);
  const [editPhonetic, setEditPhonetic] = useState('');

  // Gemini難易度判定・発音記号取得の進行状況
  const [judgingWordId, setJudgingWordId] = useState<string | null>(null);
  const [fetchingPhoneticId, setFetchingPhoneticId] = useState<string | null>(null);
  const [bulkJudging, setBulkJudging] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [bulkPhoneticFetching, setBulkPhoneticFetching] = useState(false);
  const [bulkPhoneticStatus, setBulkPhoneticStatus] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  const selectedSet = sets.find((s) => s.id === selectedSetId) ?? null;

  async function loadSets() {
    setLoadingSets(true);
    const res = await fetch('/api/sets');
    const json = await res.json();
    if (res.ok) setSets(json.data);
    setLoadingSets(false);
  }

  async function loadWords(setId: string) {
    setLoadingWords(true);
    const res = await fetch(`/api/words?set_id=${setId}`);
    const json = await res.json();
    if (res.ok) setWords(json.data);
    setLoadingWords(false);
  }

  useEffect(() => {
    loadSets();
  }, []);

  useEffect(() => {
    if (selectedSetId) loadWords(selectedSetId);
    else setWords([]);
    setSelectedIds(new Set());
  }, [selectedSetId]);

  const visibleWords = useMemo(
    () => (showArchived ? words : words.filter((w) => !w.archived)),
    [words, showArchived]
  );

  const sortedWords = useMemo(() => {
    const arr = [...visibleWords];
    switch (sortKey) {
      case 'difficulty_desc':
        return arr.sort((a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0));
      case 'difficulty_asc':
        return arr.sort((a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0));
      case 'importance_desc':
        return arr.sort((a, b) => b.importance - a.importance);
      case 'created_desc':
      default:
        return arr.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
  }, [visibleWords, sortKey]);

  async function createSet(e: React.FormEvent) {
    e.preventDefault();
    if (!newSetName.trim()) return;
    const res = await fetch('/api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newSetName.trim(),
        type: newSetType,
        description: newSetDesc.trim() || null,
      }),
    });
    if (res.ok) {
      setNewSetName('');
      setNewSetDesc('');
      await loadSets();
    }
  }

  async function deleteSet(id: string) {
    if (!confirm('この単語帳と含まれる単語・学習ログを全て削除します。よろしいですか？')) return;
    await fetch(`/api/sets/${id}`, { method: 'DELETE' });
    if (selectedSetId === id) setSelectedSetId(null);
    await loadSets();
  }

  async function createWord(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSetId || !newWord.trim() || !newMean.trim()) return;
    const res = await fetch('/api/words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        set_id: selectedSetId,
        word: newWord.trim(),
        mean: newMean.trim(),
        remarks: newRemarks.trim() || null,
        importance: newImportance,
      }),
    });
    if (res.ok) {
      setNewWord('');
      setNewMean('');
      setNewRemarks('');
      setNewImportance(3);
      await loadWords(selectedSetId);
    }
  }

  function startEdit(w: Word) {
    setEditingWordId(w.id);
    setEditWord(w.word);
    setEditMean(w.mean);
    setEditRemarks(w.remarks ?? '');
    setEditImportance(w.importance ?? 3);
    setEditPhonetic(w.phonetic ?? '');
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/words/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: editWord.trim(),
        mean: editMean.trim(),
        remarks: editRemarks.trim() || null,
        importance: editImportance,
        phonetic: editPhonetic.trim() || null,
      }),
    });
    if (res.ok && selectedSetId) {
      setEditingWordId(null);
      await loadWords(selectedSetId);
    }
  }

  async function deleteWord(id: string) {
    if (!confirm('この単語を削除しますか？(アーカイブと違い元に戻せません)')) return;
    await fetch(`/api/words/${id}`, { method: 'DELETE' });
    if (selectedSetId) await loadWords(selectedSetId);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === sortedWords.length ? new Set() : new Set(sortedWords.map((w) => w.id))
    );
  }

  async function archiveSelected(archived: boolean) {
    if (selectedIds.size === 0 || !selectedSetId) return;
    setArchiving(true);
    try {
      await fetch('/api/words/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), archived }),
      });
      setSelectedIds(new Set());
      await loadWords(selectedSetId);
    } finally {
      setArchiving(false);
    }
  }

  async function judgeDifficulty(wordId: string) {
    if (getGeminiRemainingToday() <= 0) {
      alert(`本日のGemini利用上限(自己集計で${GEMINI_DAILY_LIMIT}件)に達しています。日を改めて実行してください。`);
      return;
    }
    setJudgingWordId(wordId);
    try {
      const res = await fetch('/api/difficulty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word_id: wordId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`難易度判定に失敗しました: ${json.error ?? '不明なエラー'}`);
      } else {
        recordGeminiUsage();
        if (selectedSetId) await loadWords(selectedSetId);
      }
    } finally {
      setJudgingWordId(null);
    }
  }

  async function fetchPhonetic(wordId: string) {
    setFetchingPhoneticId(wordId);
    try {
      const res = await fetch('/api/phonetic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word_id: wordId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(`発音記号の取得に失敗しました: ${json.error ?? '不明なエラー'}`);
      } else if (selectedSetId) {
        await loadWords(selectedSetId);
      }
    } finally {
      setFetchingPhoneticId(null);
    }
  }

  // Gemini難易度判定を単語ごとに1件ずつ呼び出す(サーバー側で一括ループするとVercelの
  // タイムアウトで数百件のうち数件しか処理できず止まってしまうため、
  // クライアント側で1件ずつ呼び出して進捗を表示しながら処理する)
  async function judgeAllDifficulty() {
    if (!selectedSetId) return;
    const target = words.filter((w) => w.difficulty === null && !w.archived);
    if (target.length === 0) {
      setBulkStatus('未判定の単語はありません');
      return;
    }

    const remainingToday = getGeminiRemainingToday();
    if (remainingToday <= 0) {
      setBulkStatus(
        `本日のGemini利用上限(自己集計で${GEMINI_DAILY_LIMIT}件)に達しています。日を改めて実行してください。`
      );
      return;
    }

    // 1日の上限を超えないよう、今日処理する分だけを切り出す。
    // 残りは翌日以降に同じボタンを押せば続きから処理される(difficultyが未判定の単語だけを対象にしているため)。
    const toProcess = target.slice(0, remainingToday);
    const remainingAfterToday = target.length - toProcess.length;

    const confirmMessage =
      remainingAfterToday > 0
        ? `未判定の単語は${target.length}件ありますが、本日判定できるのは残り${toProcess.length}件までです(1日の上限: ${GEMINI_DAILY_LIMIT}件)。\n今日は${toProcess.length}件を処理し、残り${remainingAfterToday}件は翌日以降にこのボタンで続きから処理してください。続行しますか？`
        : `未判定の単語${toProcess.length}件をGeminiで判定します。件数が多いと数分かかることがあります。続行しますか？`;

    if (!confirm(confirmMessage)) return;

    setBulkJudging(true);
    let done = 0;
    let failed = 0;
    let stoppedByQuota = false;
    for (const w of toProcess) {
      try {
        const res = await fetch('/api/difficulty', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word_id: w.id }),
        });
        if (res.ok) {
          done += 1;
          recordGeminiUsage();
        } else if (res.status === 429) {
          // 自己集計のカウンタとGoogle側の実際のクォータがズレている場合の最終防御。
          // これ以上呼び出しても無駄になるため即中断する。
          stoppedByQuota = true;
          break;
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      setBulkStatus(`判定中... ${done + failed} / ${toProcess.length}件(失敗${failed}件)`);
      await sleep(150); // APIのレート制限に配慮して少し間隔を空ける
    }
    if (stoppedByQuota) {
      setBulkStatus(
        `Gemini APIの利用上限(1日の無料枠)に達したため中断しました。成功${done}件 / 対象${toProcess.length}件。時間を置くか翌日以降に再試行してください。`
      );
    } else if (remainingAfterToday > 0) {
      setBulkStatus(
        `本日分完了: 成功${done}件 / 失敗${failed}件 / 対象${toProcess.length}件。残り${remainingAfterToday}件は翌日以降にこのボタンで続きから処理できます。`
      );
    } else {
      setBulkStatus(`完了: 成功${done}件 / 失敗${failed}件 / 全${toProcess.length}件`);
    }
    setBulkJudging(false);
    await loadWords(selectedSetId);
  }

  // 発音記号の一括取得も同じ理由でクライアント側から1件ずつ呼び出す(英単語のみ)
  async function fetchAllPhonetic() {
    if (!selectedSetId || selectedSet?.type !== 'english') return;
    const target = words.filter((w) => !w.phonetic && !w.archived);
    if (target.length === 0) {
      setBulkPhoneticStatus('未取得の単語はありません');
      return;
    }
    if (!confirm(`未取得の単語${target.length}件の発音記号を取得します。続行しますか？`)) return;

    setBulkPhoneticFetching(true);
    let done = 0;
    let failed = 0;
    for (const w of target) {
      try {
        const res = await fetch('/api/phonetic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word_id: w.id }),
        });
        if (res.ok) done += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
      setBulkPhoneticStatus(`取得中... ${done + failed} / ${target.length}件(失敗${failed}件)`);
      await sleep(150);
    }
    setBulkPhoneticStatus(`完了: 成功${done}件 / 失敗${failed}件 / 全${target.length}件`);
    setBulkPhoneticFetching(false);
    await loadWords(selectedSetId);
  }

  return (
    <main>
      <NavHeader />
      <h1 className="mb-4 text-xl font-bold">管理者画面</h1>

      {/* 単語帳の作成 */}
      <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-3 font-bold">単語帳を新規作成</h2>
        <form onSubmit={createSet} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            placeholder="単語帳名(例: 英単語 第1章)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            value={newSetType}
            onChange={(e) => setNewSetType(e.target.value as WordSetType)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="english">英単語(日⇄英)</option>
            <option value="kobun">古文単語(現⇄古)</option>
          </select>
          <input
            value={newSetDesc}
            onChange={(e) => setNewSetDesc(e.target.value)}
            placeholder="説明(任意)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="col-span-full rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white sm:col-span-1"
          >
            作成
          </button>
        </form>
      </section>

      {/* 単語帳一覧 */}
      <section className="mb-6">
        <h2 className="mb-2 font-bold">単語帳一覧</h2>
        {loadingSets && <p className="text-sm text-gray-400">読み込み中...</p>}
        <div className="flex flex-wrap gap-2">
          {sets.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSetId(s.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                selectedSetId === s.id
                  ? 'border-primary-600 bg-primary-600 text-white'
                  : 'border-gray-300 bg-white text-gray-700'
              }`}
            >
              {s.name}
              <span className="ml-1 text-xs opacity-70">
                ({s.type === 'english' ? '英単語' : '古文単語'})
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 選択中の単語帳の単語管理 */}
      {selectedSet && (
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">「{selectedSet.name}」の単語管理</h2>
            <div className="flex items-center gap-3">
              <Link href={`/test/${selectedSet.id}`} className="text-xs text-primary-600 hover:underline">
                📝 アーカイブからテスト作成
              </Link>
              <button onClick={() => deleteSet(selectedSet.id)} className="text-xs text-red-500 hover:underline">
                単語帳を削除
              </button>
            </div>
          </div>

          <div className="mb-4">
            <ImportCsv setId={selectedSet.id} onImported={() => loadWords(selectedSet.id)} />
          </div>

          <form onSubmit={createWord} className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-5">
            <input
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              placeholder={selectedSet.type === 'english' ? '英単語' : '古語'}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={newMean}
              onChange={(e) => setNewMean(e.target.value)}
              placeholder={selectedSet.type === 'english' ? '意味(日本語)' : '現代語訳'}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={newRemarks}
              onChange={(e) => setNewRemarks(e.target.value)}
              placeholder="備考(任意)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={newImportance}
              onChange={(e) => setNewImportance(Number(e.target.value))}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              title="重要度(出題頻度に影響。5が最も高頻度)"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  重要度 {n}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white">
              単語を追加
            </button>
          </form>

          {/* 一括操作バー */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">並び替え:</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="created_desc">登録順(新しい順)</option>
                <option value="difficulty_desc">難易度が高い順</option>
                <option value="difficulty_asc">難易度が低い順</option>
                <option value="importance_desc">重要度が高い順</option>
              </select>
              <label className="ml-2 flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                アーカイブ済みも表示
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GeminiQuotaBadge />
              {bulkStatus && <span className="text-xs text-gray-500">{bulkStatus}</span>}
              <button
                onClick={judgeAllDifficulty}
                disabled={bulkJudging || words.length === 0}
                className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {bulkJudging ? '判定中...' : 'Geminiで難易度を一括判定'}
              </button>
              {selectedSet.type === 'english' && (
                <>
                  {bulkPhoneticStatus && (
                    <span className="text-xs text-gray-500">{bulkPhoneticStatus}</span>
                  )}
                  <button
                    onClick={fetchAllPhonetic}
                    disabled={bulkPhoneticFetching || words.length === 0}
                    className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {bulkPhoneticFetching ? '取得中...' : '発音記号を一括取得'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 選択中の操作 */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={sortedWords.length > 0 && selectedIds.size === sortedWords.length}
                onChange={toggleSelectAll}
              />
              全て選択
            </label>
            <span className="text-gray-400">選択中: {selectedIds.size}件</span>
            <button
              onClick={() => archiveSelected(true)}
              disabled={selectedIds.size === 0 || archiving}
              className="rounded-lg bg-gray-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              選択した単語をアーカイブ
            </button>
            <button
              onClick={() => archiveSelected(false)}
              disabled={selectedIds.size === 0 || archiving}
              className="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
            >
              選択した単語を復元
            </button>
          </div>

          {loadingWords && <p className="text-sm text-gray-400">読み込み中...</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2">✓</th>
                  <th className="py-2 pr-2">単語</th>
                  <th className="py-2 pr-2">意味</th>
                  <th className="py-2 pr-2">備考</th>
                  <th className="py-2 pr-2">重要度</th>
                  <th className="py-2 pr-2">難易度</th>
                  {selectedSet.type === 'english' && <th className="py-2 pr-2">発音記号</th>}
                  <th className="py-2 pr-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {sortedWords.map((w) => (
                  <tr key={w.id} className={`border-b last:border-0 ${w.archived ? 'opacity-50' : ''}`}>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(w.id)}
                        onChange={() => toggleSelect(w.id)}
                      />
                    </td>
                    {editingWordId === w.id ? (
                      <>
                        <td className="py-2 pr-2">
                          <input
                            value={editWord}
                            onChange={(e) => setEditWord(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={editMean}
                            onChange={(e) => setEditMean(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            value={editRemarks}
                            onChange={(e) => setEditRemarks(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            value={editImportance}
                            onChange={(e) => setEditImportance(Number(e.target.value))}
                            className="rounded border border-gray-300 px-2 py-1"
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2 text-gray-400">{w.difficulty ?? '未判定'}</td>
                        {selectedSet.type === 'english' && (
                          <td className="py-2 pr-2">
                            <input
                              value={editPhonetic}
                              onChange={(e) => setEditPhonetic(e.target.value)}
                              placeholder="例: /əˈbaʊt/"
                              className="w-24 rounded border border-gray-300 px-2 py-1"
                            />
                          </td>
                        )}
                        <td className="py-2 pr-2 text-right">
                          <button onClick={() => saveEdit(w.id)} className="mr-2 text-primary-600 hover:underline">
                            保存
                          </button>
                          <button onClick={() => setEditingWordId(null)} className="text-gray-400 hover:underline">
                            取消
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-2 font-medium">
                          {w.word}
                          {w.archived && (
                            <span className="ml-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
                              アーカイブ済
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-2">{w.mean}</td>
                        <td className="py-2 pr-2 text-gray-500">{w.remarks}</td>
                        <td className="py-2 pr-2">
                          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                            {w.importance}
                          </span>
                        </td>
                        <td className="py-2 pr-2">
                          {w.difficulty ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                              {w.difficulty}
                            </span>
                          ) : (
                            <button
                              onClick={() => judgeDifficulty(w.id)}
                              disabled={judgingWordId === w.id}
                              className="text-xs text-amber-600 hover:underline disabled:opacity-50"
                            >
                              {judgingWordId === w.id ? '判定中...' : 'Geminiで判定'}
                            </button>
                          )}
                        </td>
                        {selectedSet.type === 'english' && (
                          <td className="py-2 pr-2">
                            {w.phonetic ? (
                              <span className="text-xs text-gray-600">[{w.phonetic}]</span>
                            ) : (
                              <button
                                onClick={() => fetchPhonetic(w.id)}
                                disabled={fetchingPhoneticId === w.id}
                                className="text-xs text-sky-600 hover:underline disabled:opacity-50"
                              >
                                {fetchingPhoneticId === w.id ? '取得中...' : '辞書で取得'}
                              </button>
                            )}
                          </td>
                        )}
                        <td className="py-2 pr-2 text-right">
                          <button onClick={() => startEdit(w)} className="mr-2 text-primary-600 hover:underline">
                            編集
                          </button>
                          <button onClick={() => deleteWord(w.id)} className="text-red-500 hover:underline">
                            削除
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!loadingWords && sortedWords.length === 0 && (
              <p className="py-4 text-center text-gray-400">
                {showArchived ? '単語が登録されていません。' : '表示できる単語がありません(全てアーカイブ済みの可能性があります)。'}
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
