'use client';

import { useState } from 'react';
import { PastExam, SECTION_KIND_LABELS } from '@/lib/types';
import { getGeminiRemainingToday, recordGeminiUsage } from '@/lib/geminiQuota';

// 登録済みの過去問1件。本文の表示・編集・削除、年の変更、大問構成の解析ができる。
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
  const [showStructure, setShowStructure] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [title, setTitle] = useState(exam.title);
  const [year, setYear] = useState(exam.year ? String(exam.year) : '');
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
    setYear(exam.year ? String(exam.year) : '');
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
      const body: Record<string, unknown> = { title, year: year.trim() === '' ? null : Number(year) };
      // 本文を変えた時だけ送る(変えると、大問構成の解析結果は消えて、解析し直しになる)
      if (draft.trim() !== (content ?? '').trim()) body.content = draft;
      const res = await fetch(`/api/exams/${exam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '保存に失敗しました');
        return;
      }
      if (body.content !== undefined) setContent(draft.trim());
      onChange(json.data as PastExam);
      setEditing(false);
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    if (getGeminiRemainingToday() <= 0) {
      setError('本日のGemini利用上限に達しています。日を改めて実行してください。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/exams/${exam.id}/analyze`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? '解析に失敗しました');
        return;
      }
      recordGeminiUsage();
      onChange(json.data as PastExam);
      setShowStructure(true);
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

  const analysis = exam.analysis ?? null;

  return (
    <li className="px-3 py-2 text-sm">
      {editing ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル(任意)"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
            />
            <input
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
              placeholder="年(西暦)"
              inputMode="numeric"
              className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-gray-300 px-2 py-1 font-mono text-xs"
          />
          <p className="text-xs text-gray-400">本文を変更して保存すると、大問構成の解析結果は消えます(解析し直してください)。</p>
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
              {exam.year && (
                <span className="mr-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-600">
                  {exam.year}年
                </span>
              )}
              <span className="font-medium">{exam.title || '(無題)'}</span>
              <span className="ml-2 text-xs text-gray-400">{exam.char_count.toLocaleString()}文字</span>
              {analysis ? (
                <button
                  onClick={() => setShowStructure((v) => !v)}
                  className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
                >
                  構成解析済み・{analysis.sections.length}大問
                </button>
              ) : (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  未解析
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={analyze} disabled={busy} className="text-primary-600 hover:underline">
                {busy ? '処理中...' : analysis ? '再解析' : '構成を解析'}
              </button>
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

          {showStructure && analysis && (
            <div className="mt-2 rounded-lg bg-green-50 p-2 text-xs text-gray-700">
              <ul className="space-y-1">
                {analysis.sections.map((s, i) => (
                  <li key={i}>
                    <b>{s.number}</b> {SECTION_KIND_LABELS[s.kind]}
                    {s.word_count ? ` ・本文${s.word_count}語` : ''}
                    {s.question_count ? ` ・${s.question_count}問` : ''}
                    {s.question_formats.length > 0 ? ` ・${s.question_formats.join('/')}` : ''}
                    {s.word_limit ? ` ・解答${s.word_limit}` : ''}
                    {s.genre ? ` ・${s.genre}` : ''}
                  </li>
                ))}
              </ul>
              {analysis.characteristics && (
                <p className="mt-2 text-gray-500">
                  問題文の特性: {analysis.characteristics}
                </p>
              )}
            </div>
          )}

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
