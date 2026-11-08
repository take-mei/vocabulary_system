'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PastExam, University } from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import PastExamRow from '@/components/PastExamRow';

const PAGE_SIZE = 100;
// 1回の送信にまとめる本文の合計文字数の目安(Vercelのリクエスト上限に収めるため)
const BATCH_CHARS = 500_000;
// 「=====」または「-----」(5個以上)だけの行を、過去問どうしの区切りとして扱う
const SEPARATOR = /^[ \t]*(?:={5,}|-{5,})[ \t]*$/m;

interface NewExam {
  title: string;
  content: string;
}

export default function UniversitiesPage() {
  const [universities, setUniversities] = useState<University[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [newName, setNewName] = useState('');

  const [exams, setExams] = useState<PastExam[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingExams, setLoadingExams] = useState(false);

  // 過去問の追加フォーム
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [split, setSplit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addStatus, setAddStatus] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = universities.find((u) => u.id === selectedId) ?? null;

  async function loadUniversities(keepSelection = true) {
    try {
      const res = await fetch('/api/universities');
      const json = await res.json();
      if (res.ok) {
        const list = json.data as University[];
        setUniversities(list);
        setSelectedId((cur) =>
          keepSelection && cur && list.some((u) => u.id === cur) ? cur : list[0]?.id ?? null
        );
      } else {
        setMessage(json.error ?? '大学の一覧を取得できませんでした');
      }
    } catch {
      setMessage('通信エラーが発生しました');
    }
    setLoading(false);
  }

  async function loadExams(universityId: string, offset = 0) {
    setLoadingExams(true);
    try {
      const res = await fetch(
        `/api/universities/${universityId}/exams?offset=${offset}&limit=${PAGE_SIZE}`
      );
      const json = await res.json();
      if (res.ok) {
        setExams((prev) => (offset === 0 ? json.data : [...prev, ...json.data]));
        setTotal(json.total as number);
      } else {
        setMessage(json.error ?? '過去問を取得できませんでした');
      }
    } catch {
      setMessage('通信エラーが発生しました');
    }
    setLoadingExams(false);
  }

  useEffect(() => {
    loadUniversities(false);
  }, []);

  useEffect(() => {
    setExams([]);
    setTotal(0);
    setAddStatus(null);
    if (selectedId) loadExams(selectedId, 0);
  }, [selectedId]);

  function bumpCount(universityId: string, count: number) {
    setUniversities((list) =>
      list.map((u) => (u.id === universityId ? { ...u, exam_count: Math.max((u.exam_count ?? 0) + count, 0) } : u))
    );
  }

  async function addUniversity(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setMessage(null);
    const res = await fetch('/api/universities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? '追加に失敗しました');
      return;
    }
    setNewName('');
    setUniversities((list) => [...list, json.data as University]);
    setSelectedId((json.data as University).id);
  }

  async function renameUniversity() {
    if (!selected) return;
    const name = window.prompt('新しい大学名', selected.name)?.trim();
    if (!name || name === selected.name) return;
    setMessage(null);
    const res = await fetch(`/api/universities/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMessage(json.error ?? '変更に失敗しました');
      return;
    }
    setUniversities((list) => list.map((u) => (u.id === selected.id ? { ...u, name } : u)));
  }

  async function deleteUniversity() {
    if (!selected) return;
    if (
      !window.confirm(
        `「${selected.name}」と、登録済みの過去問${selected.exam_count ?? 0}件をすべて削除します。よろしいですか?`
      )
    )
      return;
    setMessage(null);
    const res = await fetch(`/api/universities/${selected.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessage(json.error ?? '削除に失敗しました');
      return;
    }
    const rest = universities.filter((u) => u.id !== selected.id);
    setUniversities(rest);
    setSelectedId(rest[0]?.id ?? null);
  }

  // 入力欄の本文とファイルから、登録する過去問の一覧を作る
  function buildExams(files: { name: string; text: string }[]): NewExam[] {
    const out: NewExam[] = [];
    const sources: { baseTitle: string; text: string }[] = [];
    if (content.trim()) sources.push({ baseTitle: title.trim(), text: content });
    files.forEach((f) =>
      sources.push({ baseTitle: f.name.replace(/\.[^.]+$/, ''), text: f.text })
    );

    for (const src of sources) {
      const parts = split ? src.text.split(SEPARATOR) : [src.text];
      const nonEmpty = parts.map((p) => p.trim()).filter(Boolean);
      nonEmpty.forEach((text, i) => {
        const suffix = nonEmpty.length > 1 ? ` (${i + 1})` : '';
        out.push({ title: src.baseTitle ? `${src.baseTitle}${suffix}` : '', content: text });
      });
    }
    return out;
  }

  async function addExams() {
    if (!selected) return;
    const picked = Array.from(fileRef.current?.files ?? []);
    if (!content.trim() && picked.length === 0) {
      setAddStatus('本文を入力するか、ファイルを選んでください');
      return;
    }

    setAdding(true);
    setAddStatus('読み込み中...');
    try {
      const files = await Promise.all(picked.map(async (f) => ({ name: f.name, text: await f.text() })));
      const list = buildExams(files);
      if (list.length === 0) {
        setAddStatus('登録できる本文がありません');
        return;
      }

      // 文字数の合計がBATCH_CHARSを超えないようにまとめて送る(件数の上限はない)
      const batches: NewExam[][] = [];
      let cur: NewExam[] = [];
      let size = 0;
      for (const item of list) {
        if (cur.length > 0 && size + item.content.length > BATCH_CHARS) {
          batches.push(cur);
          cur = [];
          size = 0;
        }
        cur.push(item);
        size += item.content.length;
      }
      if (cur.length > 0) batches.push(cur);

      let added = 0;
      for (const batch of batches) {
        setAddStatus(`登録中... ${added}/${list.length}件`);
        const res = await fetch(`/api/universities/${selected.id}/exams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exams: batch }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAddStatus(
            `${added}件登録したところでエラー: ${json.error ?? '登録に失敗しました'}` +
              (res.status === 413 ? '(1回に送れる量を超えました。ファイルを分けてください)' : '')
          );
          bumpCount(selected.id, added);
          await loadExams(selected.id, 0);
          return;
        }
        added += json.added as number;
      }

      setAddStatus(`${added}件の過去問を登録しました`);
      setTitle('');
      setContent('');
      if (fileRef.current) fileRef.current.value = '';
      bumpCount(selected.id, added);
      await loadExams(selected.id, 0);
    } catch {
      setAddStatus('通信エラーが発生しました');
    } finally {
      setAdding(false);
    }
  }

  function handleExamChange(updated: PastExam) {
    setExams((list) => list.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
  }

  function handleExamRemove(id: string) {
    setExams((list) => list.filter((e) => e.id !== id));
    setTotal((t) => Math.max(t - 1, 0));
    if (selectedId) bumpCount(selectedId, -1);
  }

  return (
    <main>
      <NavHeader />
      <h1 className="mb-1 text-xl font-bold">大学別 過去問</h1>
      <p className="mb-4 text-sm text-gray-500">
        大学ごとに過去問を登録しておくと、長文読解問題を作るときに、その大学の出題傾向(テーマ・長さ・難易度・設問の観点)を参考にして作れます。登録できる大学の数・過去問の件数に上限はありません。
      </p>

      {message && <p className="mb-3 text-sm text-red-500">{message}</p>}

      {/* 大学の追加と選択 */}
      <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-3 font-bold">大学</h2>
        <form onSubmit={addUniversity} className="mb-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="大学名(例: 筑波大学)"
            maxLength={100}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            追加
          </button>
        </form>

        {loading && <p className="text-sm text-gray-400">読み込み中...</p>}
        {!loading && universities.length === 0 && (
          <p className="text-sm text-gray-500">まだ大学が登録されていません。上のフォームから追加してください。</p>
        )}
        <div className="flex flex-wrap gap-2">
          {universities.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelectedId(u.id)}
              className={`rounded-full px-3 py-1 text-sm font-medium ring-1 transition ${
                u.id === selectedId
                  ? 'bg-primary-600 text-white ring-primary-600'
                  : 'bg-white text-gray-700 ring-gray-300 hover:ring-primary-400'
              }`}
            >
              {u.name}
              <span className={`ml-1 text-xs ${u.id === selectedId ? 'text-primary-100' : 'text-gray-400'}`}>
                {u.exam_count ?? 0}
              </span>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <>
          {/* 過去問の追加 */}
          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">「{selected.name}」の過去問を追加</h2>
              <div className="flex gap-3 text-xs">
                <button onClick={renameUniversity} className="text-primary-600 hover:underline">
                  大学名を変更
                </button>
                <button onClick={deleteUniversity} className="text-red-500 hover:underline">
                  この大学を削除
                </button>
              </div>
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル(任意。例: 2024 前期 大問1)"
              maxLength={200}
              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              placeholder="過去問の英文(本文・設問など)を貼り付けてください"
              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />

            <div className="mb-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
              <p className="mb-1 text-xs font-semibold text-gray-700">テキストファイルから追加(複数選択可)</p>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".txt,.md,text/plain,text/markdown"
                disabled={adding}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white"
              />
              <p className="mt-1 text-xs text-gray-400">
                UTF-8のテキスト(.txt / .md)に対応。1ファイル=1件として登録され、ファイル名がタイトルになります。
              </p>
            </div>

            <label className="mb-3 flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="mt-0.5" />
              <span>
                <code>=====</code> または <code>-----</code>(5個以上)だけの行を区切りにして、複数の過去問として一度に登録する
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={addExams}
                disabled={adding}
                className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {adding ? '登録中...' : '過去問を登録'}
              </button>
              {addStatus && <span className="text-xs text-gray-600">{addStatus}</span>}
            </div>
          </section>

          {/* 登録済みの過去問 */}
          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="mb-3 font-bold">登録済みの過去問({total}件)</h2>
            {exams.length === 0 && !loadingExams && (
              <p className="text-sm text-gray-500">まだ過去問がありません。</p>
            )}
            {exams.length > 0 && (
              <ul className="divide-y divide-gray-100 rounded-xl ring-1 ring-gray-100">
                {exams.map((exam) => (
                  <PastExamRow key={exam.id} exam={exam} onChange={handleExamChange} onRemove={handleExamRemove} />
                ))}
              </ul>
            )}
            {loadingExams && <p className="mt-2 text-sm text-gray-400">読み込み中...</p>}
            {!loadingExams && exams.length < total && (
              <button
                onClick={() => loadExams(selected.id, exams.length)}
                className="mt-3 text-sm text-primary-600 hover:underline"
              >
                さらに読み込む(残り{total - exams.length}件)
              </button>
            )}
          </section>
        </>
      )}

      <p className="text-xs text-gray-400">
        <Link href="/" className="text-primary-600 hover:underline">← 単語帳に戻る</Link>
        {' '}・ 長文問題は、単語帳の「📝 アーカイブからテスト作成」画面で作れます。
      </p>
    </main>
  );
}
