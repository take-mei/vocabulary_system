// 長文作成の「設計図」を作る処理(Geminiは呼ばない)。サーバー側で使うが、純粋な関数なので単体でも試せる。
//
// 考え方:
//  - 選んだ大学(複数可)の、解析済みの過去問の中から、新しい年ほど選ばれやすいように重み付けして「手本」を1つ選ぶ。
//    その手本の大問構成(大問の数・種類・語数・設問の形式・英作文の有無など)を、そのまま再現する
//  - 問題文の特性(文体・語彙水準など)は、重み付けして選んだ複数の過去問の解析結果を、重要度つきで参考にする
//  - 年が新しいほど重く、古くなるほど「だんだんと」軽くなる(下の RECENCY_DECAY)

import {
  ExamPlan,
  ExamAnalysis,
  PlannedSection,
  SECTION_KIND_LABELS,
  SectionKind,
  UNSUPPORTED_KINDS,
} from '@/lib/types';

// 1年古くなるごとに、重みが何倍になるか(0.8なら、1年前=0.8 / 3年前≈0.51 / 5年前≈0.33 / 10年前≈0.11)
export const RECENCY_DECAY = 0.8;
// 年を入れていない過去問の重み(最新の年=1.0に対して)
export const UNDATED_WEIGHT = 0.4;
// 出題傾向の要約に使う過去問の数
export const STYLE_NOTE_COUNT = 5;
// 単語を割り当てる(=本文や解答で単語を使う)大問の種類
const VOCAB_KINDS: SectionKind[] = ['long_reading', 'conversation', 'summary', 'grammar_vocab', 'essay_translation'];

export interface ExamMeta {
  id: string;
  university_id: string;
  title: string;
  year: number | null;
  analysis: ExamAnalysis | null;
}

export function examWeight(year: number | null, newestYear: number | null): number {
  if (newestYear === null) return 1; // どの過去問にも年がなければ、みな同じ重み
  if (year === null) return UNDATED_WEIGHT;
  const age = Math.max(newestYear - year, 0);
  return Math.pow(RECENCY_DECAY, age);
}

export function weightedSample<T>(
  items: T[],
  weight: (t: T) => number,
  count: number,
  rng: () => number = Math.random
): T[] {
  const pool = items.map((item) => ({ item, w: Math.max(weight(item), 0) }));
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.w, 0);
    let idx = pool.length - 1;
    if (total > 0) {
      let r = rng() * total;
      for (let i = 0; i < pool.length; i++) {
        r -= pool[i].w;
        if (r < 0) {
          idx = i;
          break;
        }
      }
    } else {
      idx = Math.floor(rng() * pool.length);
    }
    out.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return out;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function importanceLabel(w: number): string {
  return w >= 0.6 ? '高' : w >= 0.3 ? '中' : '低';
}

function structureLine(a: ExamAnalysis): string {
  return a.sections.map((s) => SECTION_KIND_LABELS[s.kind]).join('→');
}

export function examLabel(universityName: string, year: number | null, title: string): string {
  return `${universityName}${year ? ` ${year}年` : ''}${title ? `(${title})` : ''}`;
}

export interface BuildPlanInput {
  exams: ExamMeta[]; // 選んだ大学の過去問(解析済みかどうかは問わない)
  universityNames: Record<string, string>; // university_id → 大学名
  wordIds: string[];
  rng?: () => number;
}

// 解析済みの過去問がなければ null(呼び出し側で「1題だけ作る」方式に切り替える)
export function buildPlan({ exams, universityNames, wordIds, rng = Math.random }: BuildPlanInput): ExamPlan | null {
  const analyzed = exams.filter((e) => e.analysis && e.analysis.sections.length > 0);
  if (analyzed.length === 0) return null;

  const years = analyzed.map((e) => e.year).filter((y): y is number => y !== null);
  const newest = years.length > 0 ? Math.max(...years) : null;
  const weightOf = (e: ExamMeta) => examWeight(e.year, newest);

  // 作成できる大問(リスニングなど)を1つも含まない手本は選ばない
  const usable = analyzed.filter((e) => e.analysis!.sections.some((s) => !UNSUPPORTED_KINDS.includes(s.kind)));
  if (usable.length === 0) return null;

  const template = weightedSample(usable, weightOf, 1, rng)[0];
  const templateSections = template.analysis!.sections;
  const kept = templateSections.filter((s) => !UNSUPPORTED_KINDS.includes(s.kind));
  const skipped = templateSections.filter((s) => UNSUPPORTED_KINDS.includes(s.kind)).map((s) => `${s.number}(${SECTION_KIND_LABELS[s.kind]})`);

  // 単語を、単語を使える大問に、ほぼ均等に振り分ける(1つも無ければ最初の大問に全部)
  const shuffled = shuffle(wordIds, rng);
  const eligible = kept.map((s, i) => (VOCAB_KINDS.includes(s.kind) ? i : -1)).filter((i) => i >= 0);
  const targets = eligible.length > 0 ? eligible : [0];
  const buckets: string[][] = kept.map(() => []);
  shuffled.forEach((id, i) => buckets[targets[i % targets.length]].push(id));
  const sections: PlannedSection[] = kept.map((s, i) => ({ ...s, word_ids: buckets[i] }));

  // 問題文の特性(重要度つき)。新しい年のものが選ばれやすい
  const styleExams = weightedSample(analyzed, weightOf, STYLE_NOTE_COUNT, rng).sort((a, b) => weightOf(b) - weightOf(a));
  const style_notes = styleExams
    .filter((e) => e.analysis!.characteristics)
    .map((e) => {
      const a = e.analysis!;
      const label = examLabel(universityNames[e.university_id] ?? '', e.year, '');
      return `[重要度:${importanceLabel(weightOf(e))}] ${label} 大問構成: ${structureLine(a)} / 設問の言語: ${a.question_language || '不明'} / ${a.characteristics}`;
    });

  // 文体の見本として抜粋を渡す過去問(手本+重み付けでもう1件)
  const others = analyzed.filter((e) => e.id !== template.id);
  const extra = weightedSample(others, weightOf, 1, rng);
  const reference_exam_ids = [template.id, ...extra.map((e) => e.id)];

  const names = Array.from(new Set(Object.values(universityNames)));
  return {
    university_names: names,
    template_label: examLabel(universityNames[template.university_id] ?? '', template.year, ''),
    question_language: template.analysis!.question_language,
    sections,
    style_notes,
    reference_exam_ids,
    skipped,
  };
}
