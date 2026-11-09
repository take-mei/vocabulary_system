'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PastExam, University } from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import PastExamRow from '@/components/PastExamRow';
import GeminiQuotaBadge from '@/components/GeminiQuotaBadge';
import { extractPdfText } from '@/lib/pdfText';
import { guessYear } from '@/lib/examAnalysis';
import { getGeminiRemainingToday, recordGeminiUsage } from '@/lib/geminiQuota';

const PAGE_SIZE = 100;
// 1回の送信にまとめる本文の合計文字数の目安(Vercelのリクエスト上限に収めるため)
const BATCH_CHARS = 500_000;
// 「=====」または「-----」(5個以上)だけの行を、過去問どうしの区切りとして扱う
const SEPARATOR = /^[ \t]*(?:={5,}|-{5,})[ \t]*$/m;

interface NewExam {
  title: string;
  year: number | null;
  content: string;
}

// 取り込み待ち(PDF・テキストファイルから読み取った内容。登録前に、タイトルと年を直せる)
interface PendingItem {
  key: string;
  fileName: string;
  title: string;
  year: string; // 入力欄の値(空なら年なし)
  content: string;
  pages: number | null;
  warning: string | null;
  error: string | null; // 読み取れなかった場合
}

let pendingSeq = 0;

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
  const [year, setYear] = useState('');
  const [content, setContent] = useState('');
  const [split, setSplit] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [reading, setReading] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [analyzeStatus, setAnalyzeStatus] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
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
    setAnalyzeStatus(null);
    setPending([]);
    if (fileRef.current) fileRef.current.value = '';
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

  // 選んだファイル(PDF・テキスト)から文字を読み取って、取り込み待ちの一覧に入れる
  async function handleFiles(files: File[]) {
    if (files.length === 0) return;
    setReading(true);
    setAddStatus(null);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setAddStatus(`読み取り中... ${i + 1}/${files.length}件(${file.name})`);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const item: PendingItem = {
        key: `p${++pendingSeq}`,
        fileName: file.name,
        title: baseName,
        year: guessYear(file.name) ? String(guessYear(file.name)) : '',
        content: '',
        pages: null,
        warning: null,
        error: null,
      };
      try {
        if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
          const r = await extractPdfText(file);
          item.content = r.text;
          item.pages = r.pages;
          if (r.text.replace(/\s/g, '').length < 40) {
            item.error =
              '文字を取り出せませんでした。画像だけ(スキャン)のPDFの可能性があります。文字が選択できるPDFを使うか、本文を貼り付けてください';
          } else if (r.likelyScanned) {
            item.warning = '文字が少なめです。画像のページが多いPDFかもしれません。登録前に文字数を確認してください';
          }
        } else {
          item.content = (await file.text()).trim();
          if (!item.content) item.error = '本文が空です';
        }
      } catch (e: any) {
        item.error = e?.message ?? '読み取りに失敗しました';
      }
      setPending((list) => [...list, item]);
    }
    setReading(false);
    setAddStatus(`${files.length}件のファイルを読み取りました。タイトルと年を確認して「登録」を押してください`);
    if (fileRef.current) fileRef.current.value = '';
  }

  function updatePending(key: string, patch: Partial<PendingItem>) {
    setPending((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  // 登録する過去問の一覧(取り込み待ち + 貼り付けた本文)を作る
  function buildExams(): { exams: NewExam[]; invalidYear: boolean } {
    const out: NewExam[] = [];
    let invalidYear = false;
    const toYear = (v: string): number | null => {
      const t = v.trim();
      if (!t) return null;
      const n = Number(t);
      if (!Number.isInteger(n) || n < 1900 || n > 2100) {
        invalidYear = true;
        return null;
      }
      return n;
    };

    for (const p of pending) {
      if (p.error || !p.content.trim()) continue;
      out.push({ title: p.title.trim(), year: toYear(p.year), content: p.content });
    }

    if (content.trim()) {
      const parts = split ? content.split(SEPARATOR) : [content];
      const nonEmpty = parts.map((t) => t.trim()).filter(Boolean);
      const manualYear = toYear(year);
      nonEmpty.forEach((text, i) => {
        const suffix = nonEmpty.length > 1 ? ` (${i + 1})` : '';
        out.push({ title: title.trim() ? `${title.trim()}${suffix}` : '', year: manualYear, content: text });
      });
    }
    return { exams: out, invalidYear };
  }

  // 過去問から大問構成を読み取る(1件につきGemini 1回)。本日の上限に達したら、そこで止める
  async function runAnalysis(ids: string[]): Promise<{ done: number; stopped: string | null }> {
    let done = 0;
    for (const id of ids) {
      if (getGeminiRemainingToday() <= 0) {
        return { done, stopped: '本日のGemini利用上限に達したため、残りは日を改めて解析してください' };
      }
      setAnalyzeStatus(`大問構成を解析中... ${done}/${ids.length}件`);
      try {
        const res = await fetch(`/api/exams/${id}/analyze`, { method: 'POST' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return { done, stopped: json.error ?? '解析に失敗しました' };
        recordGeminiUsage();
        done++;
        setExams((list) => list.map((e) => (e.id === id ? { ...e, ...(json.data as PastExam) } : e)));
      } catch {
        return { done, stopped: '通信エラーが発生しました' };
      }
    }
    return { done, stopped: null };
  }

  async function analyzeAllUnanalyzed() {
    if (!selected) return;
    setAnalyzing(true);
    setAnalyzeStatus('未解析の過去問を調べています...');
    try {
      const ids: string[] = [];
      for (let offset = 0; ; offset += 200) {
        const res = await fetch(`/api/universities/${selected.id}/exams?unanalyzed=true&limit=200&offset=${offset}`);
        const json = await res.json();
        if (!res.ok) {
          setAnalyzeStatus(json.error ?? '取得に失敗しました');
          return;
        }
        (json.data as PastExam[]).forEach((e) => ids.push(e.id));
        if ((json.data as PastExam[]).length < 200) break;
      }
      if (ids.length === 0) {
        setAnalyzeStatus('未解析の過去問はありません');
        return;
      }
      const { done, stopped } = await runAnalysis(ids);
      setAnalyzeStatus(`${done}/${ids.length}件を解析しました${stopped ? `。${stopped}` : ''}`);
      await loadExams(selected.id, 0);
    } finally {
      setAnalyzing(false);
    }
  }

  async function addExams() {
    if (!selected) return;
    const { exams: list, invalidYear } = buildExams();
    if (invalidYear) {
      setAddStatus('年は1900〜2100の西暦(整数)で入力してください');
      return;
    }
    if (list.length === 0) {
      setAddStatus('登録できる過去問がありません。PDFかテキストのファイルを選ぶか、本文を貼り付けてください');
      return;
    }

    setAdding(true);
    try {
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
      const newIds: string[] = [];
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
        (json.data as PastExam[]).forEach((e) => newIds.push(e.id));
      }

      setAddStatus(`${added}件の過去問を登録しました`);
      setTitle('');
      setYear('');
      setContent('');
      setPending([]);
      if (fileRef.current) fileRef.current.value = '';
      bumpCount(selected.id, added);
      await loadExams(selected.id, 0);

      // 登録した過去問の大問構成を、続けて解析する
      if (autoAnalyze && newIds.length > 0) {
        setAnalyzing(true);
        const { done, stopped } = await runAnalysis(newIds);
        setAnalyzeStatus(`${done}/${newIds.length}件の大問構成を解析しました${stopped ? `。${stopped}` : ''}`);
        setAnalyzing(false);
        await loadExams(selected.id, 0);
      }
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

            {/* PDF・テキストファイルから(複数可) */}
            <div className="mb-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
              <p className="mb-1 text-xs font-semibold text-gray-700">PDF・テキストファイルから追加(複数選択可)</p>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,application/pdf,.txt,.md,text/plain,text/markdown"
                disabled={adding || reading}
                onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-600 file:px-3 file:py-1.5 file:text-white"
              />
              <p className="mt-1 text-xs text-gray-400">
                PDFは端末の中で文字を読み取ります(PDFそのものは送信しません)。文字が選択できるPDFに対応しています。画像だけ(スキャン)のPDFは読み取れません。1ファイル=1件で、ファイル名がタイトルになります。
              </p>
            </div>

            {pending.length > 0 && (
              <ul className="mb-3 divide-y divide-gray-100 rounded-xl ring-1 ring-gray-200">
                {pending.map((p) => (
                  <li key={p.key} className="space-y-1 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-gray-500">
                        {p.fileName}
                        {p.pages ? ` ・${p.pages}ページ` : ''} ・{p.content.length.toLocaleString()}文字
                      </span>
                      <button
                        onClick={() => setPending((list) => list.filter((x) => x.key !== p.key))}
                        className="shrink-0 text-xs text-red-500 hover:underline"
                      >
                        外す
                      </button>
                    </div>
                    {p.error ? (
                      <p className="text-xs text-red-500">{p.error}</p>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <input
                            value={p.title}
                            onChange={(e) => updatePending(p.key, { title: e.target.value })}
                            placeholder="タイトル"
                            maxLength={200}
                            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                          />
                          <input
                            value={p.year}
                            onChange={(e) => updatePending(p.key, { year: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })}
                            placeholder="年(任意)"
                            inputMode="numeric"
                            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                          />
                        </div>
                        {p.warning && <p className="text-xs text-amber-600">{p.warning}</p>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* 本文を貼り付けて */}
            <p className="mb-1 text-xs font-semibold text-gray-700">本文を貼り付けて追加</p>
            <div className="mb-2 flex gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="タイトル(任意。例: 前期 大問1)"
                maxLength={200}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
              <input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                placeholder="年(任意)"
                inputMode="numeric"
                className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="過去問の英文(本文・設問など)を貼り付けてください"
              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
            <label className="mb-3 flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="mt-0.5" />
              <span>
                貼り付けた本文を、<code>=====</code> または <code>-----</code>(5個以上)だけの行で区切って、複数の過去問として一度に登録する
              </span>
            </label>

            <p className="mb-3 text-xs text-gray-400">
              年(西暦)は任意です。入れておくと、長文を作るとき、新しい年の過去問ほど重く(古くなるほど少しずつ軽く)扱われます。年を入れなかった過去問は、中くらいの重さで扱われます。
            </p>

            <label className="mb-3 flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={autoAnalyze} onChange={(e) => setAutoAnalyze(e.target.checked)} className="mt-0.5" />
              <span>
                登録後に、大問の構成と問題文の特性をGeminiで解析する(1件につきGemini 1回。解析しておくと、長文を作るときに大問構成・英作文の形式を再現できます)
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={addExams}
                disabled={adding || reading || analyzing}
                className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {adding ? '登録中...' : '過去問を登録'}
              </button>
              <GeminiQuotaBadge />
              {addStatus && <span className="text-xs text-gray-600">{addStatus}</span>}
            </div>
            {analyzeStatus && <p className="mt-2 text-xs text-gray-600">{analyzeStatus}</p>}
          </section>

          {/* 登録済みの過去問 */}
          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">登録済みの過去問({total}件)</h2>
              <button
                onClick={analyzeAllUnanalyzed}
                disabled={analyzing || adding}
                className="text-xs text-primary-600 hover:underline disabled:opacity-50"
              >
                {analyzing ? '解析中...' : '未解析の過去問をまとめて解析'}
              </button>
            </div>
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
