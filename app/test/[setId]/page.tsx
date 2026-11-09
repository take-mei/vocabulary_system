'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { GeneratedPassage } from '@/lib/gemini';
import {
  ExamPlan,
  GeneratedSection,
  MODE_LABELS,
  MODES_BY_TYPE,
  QuizMode,
  University,
  Word,
  WordSet,
} from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import PdfExportButton from '@/components/PdfExportButton';
import WordList from '@/components/WordList';
import GeminiQuotaBadge from '@/components/GeminiQuotaBadge';
import ExamSections from '@/components/ExamSections';
import { wordAppearsInText } from '@/lib/wordMatch';
import { getGeminiRemainingToday, recordGeminiUsage } from '@/lib/geminiQuota';

const FRONT_IS_WORD: QuizMode[] = ['en_to_jp', 'ko_to_gen'];
const UNIVERSITY_KEY = 'wordapp:passage-universities'; // 選んだ大学のID(複数)をJSONで保存

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
  const [universityIds, setUniversityIds] = useState<string[]>([]);
  const [genProgress, setGenProgress] = useState<string | null>(null);
  const [passageNote, setPassageNote] = useState<string | null>(null);

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
          const saved = JSON.parse(window.localStorage.getItem(UNIVERSITY_KEY) ?? '[]');
          if (Array.isArray(saved)) {
            setUniversityIds(
              saved.filter((id: unknown) => list.some((u) => u.id === id && (u.exam_count ?? 0) > 0))
            );
          }
        } catch {
          // localStorageが使えなくても動くようにする
        }
      } catch {
        // 通信できない時は「指定なし」のまま使えるようにする
      }
    })();
  }, []);

  function saveUniversityIds(ids: string[]) {
    setUniversityIds(ids);
    try {
      if (ids.length > 0) window.localStorage.setItem(UNIVERSITY_KEY, JSON.stringify(ids));
      else window.localStorage.removeItem(UNIVERSITY_KEY);
    } catch {
      // 保存できなくても選択は反映する
    }
  }

  // 大学のボタンは、押すたびに選択・解除が切り替わる(複数選択できる)
  function toggleUniversity(id: string) {
    saveUniversityIds(universityIds.includes(id) ? universityIds.filter((x) => x !== id) : [...universityIds, id]);
  }

  const selectedUniversities = universities.filter((u) => universityIds.includes(u.id));
  const selectedExamTotal = selectedUniversities.reduce((sum, u) => sum + (u.exam_count ?? 0), 0);

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

  async function postJson(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  }

  // 大問ごとに作ったものを、1つの問題にまとめる(使われた単語の数も、本文と模範解答から調べる)
  function assemblePassage(plan: ExamPlan, sections: GeneratedSection[], words: Word[]): GeneratedPassage {
    const allText = sections
      .map((sec) => `${sec.passage}\n${sec.questions.map((q) => q.model_answer).join('\n')}`)
      .join('\n');
    const unused = words.filter((w) => !wordAppearsInText(w.word, allText));
    return {
      title: `${plan.template_label}形式の模擬問題`,
      passage: '',
      used_words: Array.from(new Set(sections.flatMap((sec) => sec.used_words))),
      questions: [],
      sections,
      selected_count: words.length,
      used_count: words.length - unused.length,
      unused_word_ids: unused.map((w) => w.id),
      university_name: plan.university_names.join('・'),
      template_label: plan.template_label,
      skipped_sections: plan.skipped,
    };
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
    setPassageNote(null);
    setPassage(null);
    setGenProgress(null);
    try {
      const wordIds = targetWords.map((w) => w.id);

      // 1) 大学が選ばれていれば、過去問から大問構成の設計図を作る(Geminiは呼ばない)
      let plan: ExamPlan | null = null;
      if (universityIds.length > 0) {
        setGenProgress('過去問から大問構成を決めています...');
        const planRes = await postJson('/api/generate-passage/plan', {
          word_ids: wordIds,
          university_ids: universityIds,
        });
        if (!planRes.ok) {
          setPassageError(planRes.json.error ?? '大問構成を決められませんでした');
          return;
        }
        if (planRes.json.mode === 'multi') {
          plan = planRes.json.plan as ExamPlan;
        } else {
          setPassageNote(
            '選んだ大学の過去問に、大問構成を解析したものがないため、過去問の傾向を参考にした長文を1題だけ作成しました。過去問の「構成を解析」をしておくと、大問構成や英作文も再現できます。'
          );
        }
      }

      // 2-a) 大問構成がない場合: 従来どおり、長文1題(+過去問の傾向を参考)
      if (!plan) {
        setGenProgress('長文を作成中...');
        const res = await postJson('/api/generate-passage', {
          word_ids: wordIds,
          university_ids: universityIds.length > 0 ? universityIds : null,
        });
        if (!res.ok) {
          setPassageError(res.json.error ?? '長文問題の生成に失敗しました');
        } else {
          recordGeminiUsage();
          setPassage(res.json.data as GeneratedPassage);
          setShowPassageAnswers(false);
        }
        return;
      }

      // 2-b) 大問構成がある場合: 大問ごとに1回ずつ作る(1回の生成時間を短くして、時間切れを防ぐ)
      const total = plan.sections.length;
      const remaining = getGeminiRemainingToday();
      if (remaining < total) {
        setPassageError(
          `この構成は${total}大問のため、Geminiを${total}回呼び出します。本日の残りは${remaining}回なので、作成できません。日を改めて実行するか、大学の選択を外して実行してください。`
        );
        return;
      }

      const done: GeneratedSection[] = [];
      for (let i = 0; i < total; i++) {
        setGenProgress(`大問 ${i + 1} / ${total} を作成中(${plan.sections[i].number})...`);
        const r = await postJson('/api/generate-passage/section', {
          plan,
          index: i,
          avoid_topics: done.map((d) => d.passage.slice(0, 100)).filter(Boolean),
        });
        if (!r.ok) {
          const message = r.json.error ?? '大問の生成に失敗しました';
          setPassageError(
            done.length > 0
              ? `大問${i + 1}以降を作成できませんでした(${message})。ここまでに作成できた大問を表示しています。`
              : message
          );
          break;
        }
        recordGeminiUsage();
        done.push(r.json.data as GeneratedSection);
        setPassage(assemblePassage(plan, done, targetWords));
        setShowPassageAnswers(false);
      }
    } catch {
      setPassageError('通信エラーが発生しました');
    } finally {
      setGeneratingPassage(false);
      setGenProgress(null);
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
                          passage.university_name ? `_${passage.university_name.slice(0, 30)}` : ''
                        }`}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* 参考にする大学(過去問)の選択(複数選択できる) */}
              <div className="mb-3 rounded-xl bg-gray-50 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-600">
                  参考にする大学の過去問(複数選択できます)
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => saveUniversityIds([])}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                      universityIds.length === 0
                        ? 'bg-primary-600 text-white ring-primary-600'
                        : 'bg-white text-gray-700 ring-gray-300 hover:ring-primary-400'
                    }`}
                  >
                    指定なし
                  </button>
                  {universities.map((u) => {
                    const empty = (u.exam_count ?? 0) === 0;
                    const active = universityIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleUniversity(u.id)}
                        disabled={empty}
                        aria-pressed={active}
                        title={empty ? '過去問が未登録です' : undefined}
                        className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          active
                            ? 'bg-primary-600 text-white ring-primary-600'
                            : 'bg-white text-gray-700 ring-gray-300 hover:ring-primary-400'
                        }`}
                      >
                        {active ? '✓ ' : ''}
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
                  {selectedUniversities.length > 0
                    ? `「${selectedUniversities.map((u) => u.name).join('」「')}」の過去問(合計${selectedExamTotal}件)を参考にします。年が新しい過去問ほど重く(古くなるほど少しずつ軽く)扱い、大問構成・英作文の形式・問題文の特性を再現した模擬問題を作ります。構成を解析済みの過去問がある場合は、大問ごとにGeminiを1回ずつ呼び出します(過去問の文章そのものは使いません)。`
                    : universities.length === 0
                    ? '大学の過去問(PDF可)を登録すると、ここから選んで、その大学の大問構成や出題傾向に近い問題を作れます。'
                    : '大学を選ぶと、その大学の過去問を参考にした問題を作ります。複数の大学を選ぶこともできます。'}
                </p>
              </div>

              <p className="mb-2 text-xs text-gray-400">
                選択した単語を全部使うとは限りません。自然な文章になる範囲で、使えるだけ使って作成します。
              </p>
              {passageError && <p className="mb-2 text-sm text-red-500">{passageError}</p>}
              {passageNote && <p className="mb-2 text-sm text-amber-600">{passageNote}</p>}
              {generatingPassage && (
                <p className="text-sm text-gray-400">
                  {genProgress ?? '生成中です。'} 数十秒かかることがあります...
                </p>
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
                  {passage.template_label && (
                    <p className="mt-1 text-xs text-gray-500">
                      大問構成の手本: {passage.template_label}({passage.sections?.length ?? 0}大問を再現)
                    </p>
                  )}
                  {passage.skipped_sections && passage.skipped_sections.length > 0 && (
                    <p className="mt-1 text-xs text-gray-400">
                      作成できないため省いた大問: {passage.skipped_sections.join('、')}
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

                  {passage.sections && passage.sections.length > 0 ? (
                    <>
                      <ExamSections sections={passage.sections} showAnswers={showPassageAnswers} />
                      {passage.used_words?.length > 0 && (
                        <p className="mt-6 text-xs text-gray-500">使用単語: {passage.used_words.join(', ')}</p>
                      )}
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
