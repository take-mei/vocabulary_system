'use client';

import { useState } from 'react';
import { PastExam } from '@/lib/types';

// 登録済みの過去問1件。本文の表示・編集・削除ができる。
// 一覧では本文を読み込まず(何百件あっても軽いように)、「表示」「編集」を押した時にその1件だけ取得する。
export default function PastExamRow({
  exam,
  onChange,
  onRemove,
}: {
  exam: PastExam;
  onChange: (updated: PastExam) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [title, setTitle] = useState(exam.title);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadContent(): Promise<string | null> {
    if (content !== null) return content;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/exams/${exam.id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '読み込みに失敗しました');
        return null;
      }
      setContent(json.data.content as string);
      return json.data.content as string;
    } catch {
      setError('通信エラーが発生しました');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    const text = await loadContent();
    if (text !== null) setOpen(true);
  }

  async function startEdit() {
    const text = await loadContent();
    if (text === null) return;
    setTitle(exam.title);
    setDraft(text);
    setEditing(true);
    setOpen(false);
  }

  async function save() {
    if (!draft.trim()) {
      setError('本文は空にできません');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/exams/${exam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content: draft }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '保存に失敗しました');
        return;
      }
      setContent(draft.trim());
      onChange(json.data as PastExam);
      setEditing(false);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`「${exam.title || '(無題)'}」を削除しますか?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/exams/${exam.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? '削除に失敗しました');
        return;
      }
      onRemove(exam.id);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-3 py-2 text-sm">
      {editing ? (
        <div className="space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="タイトル(任意)"
            className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-gray-300 px-2 py-1 font-mono text-xs"
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded-lg px-3 py-1 text-xs text-gray-500 ring-1 ring-gray-300"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="font-medium">{exam.title || '(無題)'}</span>
              <span className="ml-2 text-xs text-gray-400">
                {exam.char_count.toLocaleString()}文字 ・{' '}
                {new Date(exam.created_at).toLocaleDateString('ja-JP')}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={toggleOpen} disabled={busy} className="text-primary-600 hover:underline">
                {open ? '閉じる' : '表示'}
              </button>
              <button onClick={startEdit} disabled={busy} className="text-primary-600 hover:underline">
                編集
              </button>
              <button onClick={remove} disabled={busy} className="text-red-500 hover:underline">
                削除
              </button>
            </div>
          </div>
          {open && content !== null && (
            <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-xs leading-relaxed text-gray-700">
              {content}
            </pre>
          )}
        </>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </li>
  );
}
