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
  phonetic: string | null; // 発音記号(IPA)。英単語のみGeminiが生成。古文単語や未生成はnull
  difficulty: number | null; // 1(易)〜5(難)。Geminiによる判定。未判定はnull
  importance: number; // 1〜5。管理者が設定する重要度。デフォルト3
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
  level: number | null; // 1〜5(5段階自己評価)。未評価の古いログはnull
  answered_at: string;
}

// 単語ごとの現在の習熟度(直近の自己評価)
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
