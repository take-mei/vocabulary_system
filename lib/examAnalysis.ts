// 過去問の解析結果(Geminiの応答)を、安全な形に整える。サーバー・ブラウザの両方で使える純粋な関数。

import { ExamAnalysis, ExamSectionSpec, SECTION_KINDS, SectionKind } from '@/lib/types';

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function posInt(v: unknown, max = 100000): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : null;
}

function kindOf(v: unknown): SectionKind {
  return SECTION_KINDS.includes(v as SectionKind) ? (v as SectionKind) : 'other';
}

export function normalizeAnalysis(raw: unknown): ExamAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rawSections = Array.isArray(r.sections) ? r.sections : [];

  const sections: ExamSectionSpec[] = rawSections
    .filter((x) => x && typeof x === 'object')
    .slice(0, 30)
    .map((x, i) => {
      const o = x as Record<string, unknown>;
      const style = o.answer_style;
      return {
        number: str(o.number, 30) || `大問${i + 1}`,
        kind: kindOf(o.kind),
        genre: str(o.genre, 200),
        word_count: posInt(o.word_count, 5000),
        question_count: posInt(o.question_count, 200),
        question_formats: (Array.isArray(o.question_formats) ? o.question_formats : [])
          .map((f) => str(f, 40))
          .filter(Boolean)
          .slice(0, 12),
        answer_style: style === 'descriptive' || style === 'mixed' ? style : 'multiple_choice',
        word_limit: str(o.word_limit, 60),
        points: posInt(o.points, 1000),
        notes: str(o.notes, 600),
      };
    });

  if (sections.length === 0) return null;

  const year = posInt(r.detected_year, 2100);
  return {
    sections,
    characteristics: str(r.characteristics, 1500),
    question_language: str(r.question_language, 40),
    detected_year: year !== null && year >= 1900 ? year : null,
  };
}

// ファイル名・タイトルから年度(西暦)を推測する。分からなければnull。(登録前の画面で候補として入れるだけで、編集できる)
export function guessYear(text: string): number | null {
  const t = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const reiwa = t.match(/令和\s*(\d{1,2}|元)/);
  if (reiwa) return 2018 + (reiwa[1] === '元' ? 1 : parseInt(reiwa[1], 10));
  const heisei = t.match(/平成\s*(\d{1,2}|元)/);
  if (heisei) return 1988 + (heisei[1] === '元' ? 1 : parseInt(heisei[1], 10));
  const seireki = t.match(/(?<!\d)(19[89]\d|20[0-4]\d)(?!\d)/);
  return seireki ? parseInt(seireki[1], 10) : null;
}
