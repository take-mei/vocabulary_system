'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { GeneratedPassage } from '@/lib/gemini';
import { MODE_LABELS, MODES_BY_TYPE, QuizMode, University, Word, WordSet } from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import PdfExportButton from '@/components/PdfExportButton';
import WordList from '@/components/WordList';
import GeminiQuotaBadge from '@/components/GeminiQuotaBadge';
import { getGeminiRemainingToday, recordGeminiUsage } from '@/lib/geminiQuota';

const FRONT_IS_WORD: QuizMode[] = ['en_to_jp', 'ko_to_gen'];
const UNIVERSITY_KEY = 'wordapp:passage-university';

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

  // 長文の参考にする大学(null = 指定なし)
  const [universities, setUniversities] = useState<University[]>([]);
  const [universityId, setUniversityId] = useState<string | null>(null);

  // 大学の一覧(過去問の件数つき)を読み込み、前回選んだ大学があれば選び直す
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/universities');
        if (!res.ok) return;
        const json = await res.json();
        const list = json.data as University[];
        setUniversities(list);
        try {
          const saved = window.localStorage.getItem(UNIVERSITY_KEY);
          if (saved && list.some((u) => u.id === saved && (u.exam_count ?? 0) > 0)) {
            setUniversityId(saved);
          }
        } catch {
          // localStorageが使えなくても動くようにする
        }
      } catch {
        // 通信できない時は「指定なし」のまま使えるようにする
      }
    })();
  }, []);

  function chooseUniversity(id: string | null) {
    setUniversityId(id);
    try {
      if (id) window.localStorage.setItem(UNIVERSITY_KEY, id);
      else window.localStorage.removeItem(UNIVERSITY_KEY);
    } catch {
      // 保存できなくても選択は反映する
    }
  }

  const selectedUniversity = universities.find((u) => u.id === universityId) ?? null;

  useEffect(() => {
    (async () => {
      let setData: WordSet | null = null;
      let list: Word[] = [];
      try {
        const res = await fetch(`/api/study?set_id=${encodeURIComponent(setId)}&archived=true`);
        if (res.ok) {
          const json = await res.json();
          setData = json.set as WordSet;
          list = (json.words as Word[]) ?? [];
        }
      } catch {
        // 通信できない時は空のまま表示する
      }

      if (setData) {
        setSet(setData);
        setMode(MODES_BY_TYPE[setData.type][0]);
      }
      setArchivedWords(list);
      setSelectedIds(new Set(list.map((w) => w.id)));
      setLoading(false);
    })();
  }, [setId]);

  const selectedWords = useMemo(
    () => archivedWords.filter((w) => selectedIds.has(w.id)),
    [archivedWords, selectedIds]
  );

  // 一覧での操作(編集・チェック・アーカイブの取り消し・削除)の反映。
  // アーカイブを取り消した単語は、アーカイブ済みの一覧(=この画面)から外す
  function handleWordChange(updated: Word) {
    if (!updated.archived) {
      handleWordRemove(updated.id);
      return;
    }
    setArchivedWords((ws) => ws.map((w) => (w.id === updated.id ? { ...w, ...updated } : w)));
  }

  function handleWordRemove(id: string) {
    setArchivedWords((ws) => ws.filter((w) => w.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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
      prev.size === archivedWords.length ? new Set() : new Set(archivedWords.map((w) => w.id))
    );
  }

  async function generatePassage(onlyIds?: string[]) {
    const targetWords = onlyIds ? archivedWords.filter((w) => onlyIds.includes(w.id)) : selectedWords;
    if (targetWords.length === 0) return;
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
        body: JSON.stringify({
          word_ids: targetWords.map((w) => w.id),
          university_id: universityId,
        }),
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
          アーカイブ済みの単語がありません。設定画面で単語をアーカイブしてください。
        </div>
      )}

      {!loading && archivedWords.length > 0 && (
        <>
          {/* 単語選択(各単語は、編集・削除・チェック・アーカイブの取り消しもできる) */}
          <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">出題する単語を選択(アーカイブ済み {archivedWords.length}件)</h2>
              <button onClick={toggleSelectAll} className="text-xs text-primary-600 hover:underline">
                {selectedIds.size === archivedWords.length ? '全て解除' : '全て選択'}
              </button>
            </div>
            <div className="max-h-[28rem] overflow-y-auto rounded-xl ring-1 ring-gray-100">
              <WordList
                words={archivedWords}
                view="list"
                typeOf={() => set?.type}
                selection={{ selectedIds, onToggle: toggleSelect }}
                onChange={handleWordChange}
                onRemove={handleWordRemove}
              />
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
                    onClick={() => generatePassage()}
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
                        fileName={`${set?.name ?? 'passage'}_長文問題${
                          passage.university_name ? `_${passage.university_name}` : ''
                        }`}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* 参考にする大学(過去問)の選択 */}
              <div className="mb-3 rounded-xl bg-gray-50 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-600">参考にする大学の過去問</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => chooseUniversity(null)}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                      universityId === null
                        ? 'bg-primary-600 text-white ring-primary-600'
                        : 'bg-white text-gray-700 ring-gray-300 hover:ring-primary-400'
                    }`}
                  >
                    指定なし
                  </button>
                  {universities.map((u) => {
                    const empty = (u.exam_count ?? 0) === 0;
                    const active = u.id === universityId;
                    return (
                      <button
                        key={u.id}
                        onClick={() => chooseUniversity(u.id)}
                        disabled={empty}
                        title={empty ? '過去問が未登録です' : undefined}
                        className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? 'bg-primary-600 text-white ring-primary-600'
                            : 'bg-white text-gray-700 ring-gray-300 hover:ring-primary-400'
                        }`}
                      >
                        {u.name}
                        <span className={`ml-1 ${active ? 'text-primary-100' : 'text-gray-400'}`}>
                          {u.exam_count ?? 0}
                        </span>
                      </button>
                    );
                  })}
                  <Link href="/universities" className="text-xs text-primary-600 hover:underline">
                    ＋ 過去問を登録・管理
                  </Link>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  {selectedUniversity
                    ? `「${selectedUniversity.name}」の過去問${selectedUniversity.exam_count}件の中から数件を参考にして、その大学の出題傾向に近い長文を作ります(過去問そのものは使いません)。`
                    : universities.length === 0
                    ? '大学の過去問を登録すると、ここから選んで、その大学の出題傾向に近い長文を作れます。'
                    : '大学を選ぶと、その大学の過去問を参考にした長文を作ります。'}
                </p>
              </div>

              <p className="mb-2 text-xs text-gray-400">
                選択した単語を全部使うとは限りません。自然な文章になる範囲で、使えるだけ使って作成します。
              </p>
              {passageError && <p className="mb-2 text-sm text-red-500">{passageError}</p>}
              {generatingPassage && (
                <p className="text-sm text-gray-400">生成中です。数十秒かかることがあります...</p>
              )}

              {passage && passage.selected_count !== undefined && (
                <div className="mb-3 rounded-xl bg-gray-50 p-3 text-sm">
                  <p>
                    選択した{passage.selected_count}語のうち、
                    <b className="text-primary-700">{passage.used_count}語</b>を使って作成しました
                    <span className="text-xs text-gray-400">(本文から調べた目安です)</span>
                  </p>
                  {passage.university_name && (
                    <p className="mt-1 text-xs text-gray-500">
                      参考にした過去問: {passage.university_name}
                      {passage.reference_titles && passage.reference_titles.length > 0 && (
                        <>({passage.reference_titles.join(' / ')})</>
                      )}
                    </p>
                  )}
                  {passage.unused_word_ids && passage.unused_word_ids.length > 0 && (
                    <>
                      <p className="mt-1 text-xs text-gray-500">
                        使われなかった単語:{' '}
                        {archivedWords
                          .filter((w) => passage.unused_word_ids?.includes(w.id))
                          .map((w) => w.word)
                          .join(', ')}
                      </p>
                      <button
                        onClick={() => generatePassage(passage.unused_word_ids)}
                        disabled={generatingPassage}
                        className="mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 ring-1 ring-primary-600 disabled:opacity-50"
                      >
                        使われなかった{passage.unused_word_ids.length}語だけで、もう1題作成
                      </button>
                    </>
                  )}
                </div>
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
