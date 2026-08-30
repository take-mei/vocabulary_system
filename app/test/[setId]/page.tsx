'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { GeneratedPassage } from '@/lib/gemini';
import { MODE_LABELS, MODES_BY_TYPE, QuizMode, Word, WordSet } from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import PdfExportButton from '@/components/PdfExportButton';
import GeminiQuotaBadge from '@/components/GeminiQuotaBadge';
import { getGeminiRemainingToday, recordGeminiUsage } from '@/lib/geminiQuota';

const FRONT_IS_WORD: QuizMode[] = ['en_to_jp', 'ko_to_gen'];

export default function ArchiveTestPage() {
  const params = useParams<{ setId: string }>();
  const setId = params.setId;

  const [set, setSet] = useState<WordSet | null>(null);
  const [archivedWords, setArchivedWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 単語テスト設定
  const [mode, setMode] = useState<QuizMode>('en_to_jp');
  const [showWordAnswers, setShowWordAnswers] = useState(false);

  // 長文問題
  const [passage, setPassage] = useState<GeneratedPassage | null>(null);
  const [generatingPassage, setGeneratingPassage] = useState(false);
  const [passageError, setPassageError] = useState<string | null>(null);
  const [showPassageAnswers, setShowPassageAnswers] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: setData } = await supabase.from('word_sets').select('*').eq('id', setId).single();
      const { data: wordData } = await supabase
        .from('words')
        .select('*')
        .eq('set_id', setId)
        .eq('archived', true)
        .order('word', { ascending: true });

      if (setData) {
        setSet(setData as WordSet);
        setMode(MODES_BY_TYPE[(setData as WordSet).type][0]);
      }
      const list = (wordData as Word[]) ?? [];
      setArchivedWords(list);
      setSelectedIds(new Set(list.map((w) => w.id)));
      setLoading(false);
    })();
  }, [setId]);

  const selectedWords = useMemo(
    () => archivedWords.filter((w) => selectedIds.has(w.id)),
    [archivedWords, selectedIds]
  );

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
      prev.size === archivedWords.length ? new Set() : new Set(archivedWords.map((w) => w.id))
    );
  }

  async function generatePassage() {
    if (selectedWords.length === 0) return;
    if (getGeminiRemainingToday() <= 0) {
      setPassageError('本日のGemini利用上限に達しています。日を改めて実行してください。');
      return;
    }
    setGeneratingPassage(true);
    setPassageError(null);
    setPassage(null);
    try {
      const res = await fetch('/api/generate-passage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word_ids: selectedWords.map((w) => w.id) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPassageError(json.error ?? '長文問題の生成に失敗しました');
      } else {
        recordGeminiUsage();
        setPassage(json.data as GeneratedPassage);
        setShowPassageAnswers(false);
      }
    } catch {
      setPassageError('通信エラーが発生しました');
    } finally {
      setGeneratingPassage(false);
    }
  }

  const frontIsWord = FRONT_IS_WORD.includes(mode);

  return (
    <main>
      <NavHeader />
      <h1 className="mb-1 text-xl font-bold">アーカイブからテスト作成</h1>
      {set && <p className="mb-4 text-sm text-gray-500">単語帳: {set.name}</p>}

      {loading && <p className="text-gray-400">読み込み中...</p>}

      {!loading && archivedWords.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          アーカイブ済みの単語がありません。管理者画面で単語をチェックしてアーカイブしてください。
        </div>
      )}

      {!loading && archivedWords.length > 0 && (
        <>
          {/* 単語選択 */}
          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">出題する単語を選択(アーカイブ済み {archivedWords.length}件)</h2>
              <button onClick={toggleSelectAll} className="text-xs text-primary-600 hover:underline">
                {selectedIds.size === archivedWords.length ? '全て解除' : '全て選択'}
              </button>
            </div>
            <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto text-sm sm:grid-cols-3">
              {archivedWords.map((w) => (
                <label key={w.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={selectedIds.has(w.id)} onChange={() => toggleSelect(w.id)} />
                  <span className="truncate">{w.word}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">選択中: {selectedWords.length}件</p>
          </section>

          {/* 単語テスト */}
          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">単語テスト</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as QuizMode)}
                  className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                >
                  {set && MODES_BY_TYPE[set.type].map((m) => (
                    <option key={m} value={m}>
                      {MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={showWordAnswers}
                    onChange={(e) => setShowWordAnswers(e.target.checked)}
                  />
                  解答を表示
                </label>
                <PdfExportButton
                  targetId="word-test-printable"
                  fileName={`${set?.name ?? 'word-test'}_単語テスト`}
                />
              </div>
            </div>

            <div id="word-test-printable" className="bg-white p-4">
              <h3 className="mb-1 text-lg font-bold">
                {set?.name} 単語テスト({MODE_LABELS[mode]})
              </h3>
              <p className="mb-4 text-xs text-gray-500">氏名: ________________　　得点: _____ / {selectedWords.length}</p>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {selectedWords.map((w) => {
                  const question = frontIsWord ? w.word : w.mean;
                  const answer = frontIsWord ? w.mean : w.word;
                  return (
                    <li key={w.id}>
                      <span className="font-medium">{question}</span>
                      <span className="mx-2 inline-block min-w-[140px] border-b border-gray-400">
                        {showWordAnswers ? (
                          <span className="font-semibold text-primary-700">{answer}</span>
                        ) : (
                          '\u00A0'
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {selectedWords.length === 0 && (
                <p className="text-sm text-gray-400">単語を選択してください。</p>
              )}
            </div>
          </section>

          {/* 長文問題(英単語セットのみ) */}
          {set?.type === 'english' && (
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold">長文読解問題(Gemini生成)</h2>
                  <GeminiQuotaBadge />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={generatePassage}
                    disabled={generatingPassage || selectedWords.length === 0}
                    className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {generatingPassage ? '生成中...' : '長文問題を作成'}
                  </button>
                  {passage && (
                    <>
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={showPassageAnswers}
                          onChange={(e) => setShowPassageAnswers(e.target.checked)}
                        />
                        解答を表示
                      </label>
                      <PdfExportButton
                        targetId="passage-printable"
                        fileName={`${set?.name ?? 'passage'}_長文問題`}
                      />
                    </>
                  )}
                </div>
              </div>

              {passageError && <p className="mb-2 text-sm text-red-500">{passageError}</p>}
              {generatingPassage && (
                <p className="text-sm text-gray-400">生成中です。数十秒かかることがあります...</p>
              )}

              {passage && (
                <div id="passage-printable" className="bg-white p-4">
                  <h3 className="mb-3 text-lg font-bold">{passage.title}</h3>
                  <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">{passage.passage}</p>

                  {passage.used_words?.length > 0 && (
                    <p className="mb-4 text-xs text-gray-500">
                      使用単語: {passage.used_words.join(', ')}
                    </p>
                  )}

                  <ol className="list-decimal space-y-3 pl-5 text-sm">
                    {passage.questions.map((q, i) => (
                      <li key={i}>
                        <p className="font-medium">{q.question}</p>
                        <ul className="mt-1 space-y-0.5 pl-4">
                          {q.choices.map((c, ci) => (
                            <li
                              key={ci}
                              className={
                                showPassageAnswers && ci === q.answer_index
                                  ? 'font-semibold text-primary-700'
                                  : ''
                              }
                            >
                              {String.fromCharCode(65 + ci)}. {c}
                              {showPassageAnswers && ci === q.answer_index ? ' ✓' : ''}
                            </li>
                          ))}
                        </ul>
                        {showPassageAnswers && (
                          <p className="mt-1 text-xs text-gray-500">解説: {q.explanation}</p>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
