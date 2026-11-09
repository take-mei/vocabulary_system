export type WordSetType = 'english' | 'kobun';

export interface WordSet {
  id: string;
  name: string;
  type: WordSetType;
  description: string | null;
  created_at: string;
}

export interface Word {
  id: string;
  set_id: string;
  word: string;
  mean: string;
  remarks: string | null;
  difficulty: number | null; // 1(易)〜5(難)。Geminiによる判定。未判定はnull
  importance: number; // 1〜5。管理者が設定する重要度。デフォルト3
  phonetic: string | null; // 発音記号(英単語のみ)。未取得はnull
  archived: boolean; // trueの場合、出題対象から除外される
  checked: boolean; // trueの場合「チェックした単語」に入る(出題画面の☆で切り替え)
  created_at: string;
}

export type QuizMode = 'jp_to_en' | 'en_to_jp' | 'gen_to_ko' | 'ko_to_gen';

export const MODE_LABELS: Record<QuizMode, string> = {
  jp_to_en: '日 → 英',
  en_to_jp: '英 → 日',
  gen_to_ko: '現 → 古',
  ko_to_gen: '古 → 現',
};

export const MODES_BY_TYPE: Record<WordSetType, QuizMode[]> = {
  english: ['jp_to_en', 'en_to_jp'],
  kobun: ['gen_to_ko', 'ko_to_gen'],
};

export interface StudyLog {
  id: string;
  word_id: string;
  set_id: string;
  mode: QuizMode;
  is_correct: boolean;
  level: number | null;
  answered_at: string;
}

export interface WordProficiency {
  word_id: string;
  level: number; // 1〜5
  updated_at: string;
}

export const PROFICIENCY_LABELS: Record<number, string> = {
  1: '全然だめ',
  2: 'あやしい',
  3: 'まあまあ',
  4: '良い感じ',
  5: 'バッチリ',
};

export const PROFICIENCY_LEVELS = [1, 2, 3, 4, 5] as const;

// --- 大学別の過去問(長文問題の参考資料) ---

export interface University {
  id: string;
  name: string;
  created_at: string;
  exam_count?: number; // 一覧APIで付く、登録済みの過去問の件数
}

export interface PastExam {
  id: string;
  university_id: string;
  title: string;
  year: number | null; // 過去問の年度(西暦)。任意。新しいほど長文作成で重く扱われる
  char_count: number;
  created_at: string;
  analysis?: ExamAnalysis | null; // 大問構成の解析結果。未解析はnull
  analyzed_at?: string | null;
  content?: string; // 一覧では含まれない(詳細取得時のみ)
}

// 過去問1件あたりの文字数の上限(件数の上限はない)。
// Vercelのリクエスト本文の上限(約4.5MB)に収まるよう、日本語でも余裕のある値にしてある。
export const MAX_EXAM_CHARS = 1_000_000;

// --- 過去問の大問構成(Geminiによる解析結果) ---

export type SectionKind =
  | 'long_reading' // 長文読解
  | 'conversation' // 会話文
  | 'grammar_vocab' // 文法・語彙(短文の空所補充など)
  | 'essay_free' // 自由英作文・意見論述
  | 'essay_translation' // 和文英訳
  | 'summary' // 要約
  | 'listening' // リスニング(音声は作れないため、模擬問題では作成しない)
  | 'other';

export const SECTION_KINDS: SectionKind[] = [
  'long_reading',
  'conversation',
  'grammar_vocab',
  'essay_free',
  'essay_translation',
  'summary',
  'listening',
  'other',
];

export const SECTION_KIND_LABELS: Record<SectionKind, string> = {
  long_reading: '長文読解',
  conversation: '会話文',
  grammar_vocab: '文法・語彙',
  essay_free: '自由英作文',
  essay_translation: '和文英訳',
  summary: '要約',
  listening: 'リスニング',
  other: 'その他',
};

// 模擬問題として作成できない大問(音声・図表などが必要なもの)
export const UNSUPPORTED_KINDS: SectionKind[] = ['listening', 'other'];

export interface ExamSectionSpec {
  number: string; // 「大問1」「Ⅰ」など
  kind: SectionKind;
  genre: string; // テーマ・ジャンル
  word_count: number | null; // 本文のおよその語数(本文なしはnull)
  question_count: number | null; // 設問数
  question_formats: string[]; // 内容一致・下線部和訳・空所補充など
  answer_style: 'multiple_choice' | 'descriptive' | 'mixed';
  word_limit: string; // 解答の字数・語数制限(なしは空文字)
  points: number | null; // 配点
  notes: string; // 指示文の形式など、再現に必要な補足
}

export interface ExamAnalysis {
  sections: ExamSectionSpec[];
  characteristics: string; // 問題文の特性(文体・語彙水準・設問の特徴など)
  question_language: string; // 設問・指示文の言語
  detected_year: number | null; // 本文から読み取れた年度(西暦)
}

// --- 長文作成の計画(大問ごとに1回ずつGeminiを呼ぶための設計図) ---

export interface PlannedSection extends ExamSectionSpec {
  word_ids: string[]; // この大問で使う候補の単語
}

export interface ExamPlan {
  university_names: string[];
  template_label: string; // 構成の手本にした過去問(例: 「筑波大学 2024年」)
  question_language: string; // 手本の過去問の、設問・指示文の言語
  sections: PlannedSection[];
  style_notes: string[]; // 出題傾向の要約(重要度つき)
  reference_exam_ids: string[]; // 文体の見本として抜粋を渡す過去問
  skipped: string[]; // 作成できないため省いた大問(リスニングなど)
}

// --- 生成された問題(大問ごと) ---

export type QuestionType = 'multiple_choice' | 'descriptive' | 'translation' | 'essay';

export interface GeneratedQuestion {
  type: QuestionType;
  question: string;
  choices: string[]; // 選択式のみ。それ以外は空
  answer_index: number; // 選択式の正解(0始まり)。それ以外は-1
  model_answer: string; // 記述・和訳・英作文の模範解答。選択式は空
  explanation: string;
  word_limit: string;
}

export interface GeneratedSection {
  number: string;
  kind: SectionKind;
  heading: string; // 大問の指示文
  passage: string; // 英文本文(なければ空)
  questions: GeneratedQuestion[];
  used_words: string[];
}
