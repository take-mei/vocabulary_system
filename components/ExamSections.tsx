'use client';

import { GeneratedQuestion, GeneratedSection, SECTION_KIND_LABELS } from '@/lib/types';

// 記述・和訳・英作文の解答欄の行数
const ANSWER_LINES: Record<string, number> = { descriptive: 3, translation: 3, essay: 8 };

function QuestionView({ q, showAnswers }: { q: GeneratedQuestion; showAnswers: boolean }) {
  const isChoice = q.type === 'multiple_choice';
  return (
    <li>
      <p className="whitespace-pre-wrap font-medium">
        {q.question}
        {q.word_limit && <span className="ml-1 text-xs font-normal text-gray-500">({q.word_limit})</span>}
      </p>

      {isChoice ? (
        <ul className="mt-1 space-y-0.5 pl-4">
          {q.choices.map((c, ci) => {
            const correct = showAnswers && ci === q.answer_index;
            return (
              <li key={ci} className={correct ? 'font-semibold text-primary-700' : ''}>
                {String.fromCharCode(65 + ci)}. {c}
                {correct ? ' ✓' : ''}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-2 space-y-1">
          {Array.from({ length: ANSWER_LINES[q.type] ?? 3 }).map((_, i) => (
            <div key={i} className="h-6 border-b border-gray-300" />
          ))}
          {showAnswers && q.model_answer && (
            <p className="whitespace-pre-wrap pt-1 text-sm font-semibold text-primary-700">
              模範解答: {q.model_answer}
            </p>
          )}
        </div>
      )}

      {showAnswers && q.explanation && (
        <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">解説: {q.explanation}</p>
      )}
    </li>
  );
}

// 大問ごとの問題(本文・設問・英作文など)を表示する。印刷・PDF出力する要素の中で使う。
export default function ExamSections({
  sections,
  showAnswers,
}: {
  sections: GeneratedSection[];
  showAnswers: boolean;
}) {
  return (
    <div className="space-y-8">
      {sections.map((s, i) => (
        <section key={i}>
          <h4 className="mb-1 text-base font-bold">
            {s.number}
            <span className="ml-2 text-xs font-normal text-gray-400">{SECTION_KIND_LABELS[s.kind]}</span>
          </h4>
          {s.heading && <p className="mb-2 whitespace-pre-wrap text-sm">{s.heading}</p>}
          {s.passage && (
            <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">{s.passage}</p>
          )}
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            {s.questions.map((q, qi) => (
              <QuestionView key={qi} q={q} showAnswers={showAnswers} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
