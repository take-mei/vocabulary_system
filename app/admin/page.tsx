'use client';

import { useEffect, useState } from 'react';
import { Word, WordSet, WordSetType } from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import ImportCsv from '@/components/ImportCsv';

export default function AdminPage() {
  const [sets, setSets] = useState<WordSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingWords, setLoadingWords] = useState(false);

  // 新規単語帳フォーム
  const [newSetName, setNewSetName] = useState('');
  const [newSetType, setNewSetType] = useState<WordSetType>('english');
  const [newSetDesc, setNewSetDesc] = useState('');

  // 新規単語フォーム
  const [newWord, setNewWord] = useState('');
  const [newMean, setNewMean] = useState('');
  const [newRemarks, setNewRemarks] = useState('');

  // 編集中の単語
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editMean, setEditMean] = useState('');
  const [editRemarks, setEditRemarks] = useState('');

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
  }, [selectedSetId]);

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
      }),
    });
    if (res.ok) {
      setNewWord('');
      setNewMean('');
      setNewRemarks('');
      await loadWords(selectedSetId);
    }
  }

  function startEdit(w: Word) {
    setEditingWordId(w.id);
    setEditWord(w.word);
    setEditMean(w.mean);
    setEditRemarks(w.remarks ?? '');
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/words/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        word: editWord.trim(),
        mean: editMean.trim(),
        remarks: editRemarks.trim() || null,
      }),
    });
    if (res.ok && selectedSetId) {
      setEditingWordId(null);
      await loadWords(selectedSetId);
    }
  }

  async function deleteWord(id: string) {
    if (!confirm('この単語を削除しますか？')) return;
    await fetch(`/api/words/${id}`, { method: 'DELETE' });
    if (selectedSetId) await loadWords(selectedSetId);
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
            <button
              onClick={() => deleteSet(selectedSet.id)}
              className="text-xs text-red-500 hover:underline"
            >
              単語帳を削除
            </button>
          </div>

          <div className="mb-4">
            <ImportCsv
              setId={selectedSet.id}
              onImported={() => loadWords(selectedSet.id)}
            />
          </div>

          <form
            onSubmit={createWord}
            className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-4"
          >
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
            <button
              type="submit"
              className="rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white"
            >
              単語を追加
            </button>
          </form>

          {loadingWords && <p className="text-sm text-gray-400">読み込み中...</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2">単語</th>
                  <th className="py-2 pr-2">意味</th>
                  <th className="py-2 pr-2">備考</th>
                  <th className="py-2 pr-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {words.map((w) => (
                  <tr key={w.id} className="border-b last:border-0">
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
                        <td className="py-2 pr-2 text-right">
                          <button
                            onClick={() => saveEdit(w.id)}
                            className="mr-2 text-primary-600 hover:underline"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingWordId(null)}
                            className="text-gray-400 hover:underline"
                          >
                            取消
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-2 font-medium">{w.word}</td>
                        <td className="py-2 pr-2">{w.mean}</td>
                        <td className="py-2 pr-2 text-gray-500">
                          {w.remarks}
                        </td>
                        <td className="py-2 pr-2 text-right">
                          <button
                            onClick={() => startEdit(w)}
                            className="mr-2 text-primary-600 hover:underline"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => deleteWord(w.id)}
                            className="text-red-500 hover:underline"
                          >
                            削除
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!loadingWords && words.length === 0 && (
              <p className="py-4 text-center text-gray-400">
                まだ単語が登録されていません。
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
