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
  answered_at: string;
}
