'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  PROFICIENCY_LABELS,
  PROFICIENCY_LEVELS,
  QuizMode,
  Word,
  WordProficiency,
  WordSet,
  MODE_LABELS,
} from '@/lib/types';
import NavHeader from '@/components/NavHeader';
import FlashCard from '@/components/FlashCard';

const FRONT_IS_WORD: QuizMode[] = ['en_to_jp', 'ko_to_gen'];
// カードの反転アニメーション時間(CSS globals.cssの.card-flip-innerと合わせる)
const FLIP_ANIMATION_MS = 500;

// 重要度・難易度・習熟度から出題の重みを計算する。
// - importance(重要度 1〜5): 高いほど出やすい
// - difficulty(難易度 1〜5、未判定は3扱い): 高いほど出やすい
// - proficiencyLevel(習熟度 1〜5、未評価は1=最も苦手扱い): 低いほど出やすい(x2で重視)
function calcWeight(word: Word, proficiencyLevel: number): number {
  const difficulty = word.difficulty ?? 3;
  const proficiencyFactor = (6 - proficiencyLevel) * 2;
  const weight = word.importance + difficulty + proficiencyFactor;
  return Math.max(weight, 1);
}

function pickWeightedIndex(weights: number[], total: number): number {
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    if (r < weights[i]) return i;
    r -= weights[i];
  }
  return weights.length - 1;
}

// 重み付きの重複ありサンプリングでcount件分の出題順(インデックス配列)を作る。
// 同じ単語が連続しないよう簡易的に1回だけ引き直す。
function buildWeightedQueue(weights: number[], count: number): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const queue: number[] = [];
  let prevIndex = -1;
  for (let i = 0; i < count; i++) {
    let idx = pickWeightedIndex(weights, total);
    if (idx === prevIndex && weights.length > 1) {
      idx = pickWeightedIndex(weights, total);
    }
    queue.push(idx);
    prevIndex = idx;
  }
  return queue;
}

export default function QuizPage() {
  const router = useRouter();
  const params = useParams<{ setId: string; mode: string }>();
  const setId = params.setId;
  const mode = params.mode as QuizMode;

  const [set, setSet] = useState<WordSet | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [proficiencyMap, setProficiencyMap] = useState<Map<string, number>>(new Map());
  const [queue, setQueue] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [results, setResults] = useState<{ correct: number; wrong: number }>({
    correct: 0,
    wrong: 0,
  });
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: setData } = await supabase
        .from('word_sets')
        .select('*')
        .eq('id', setId)
        .single();
      const { data: wordData } = await supabase
        .from('words')
        .select('*')
        .eq('set_id', setId);

      if (setData) setSet(setData as WordSet);

      const wordList = (wordData as Word[]) ?? [];
      setWords(wordList);

      let profMap = new Map<string, number>();
      if (wordList.length > 0) {
        const { data: profData } = await supabase
          .from('word_proficiency')
          .select('*')
          .in(
            'word_id',
            wordList.map((w) => w.id)
          );
        (profData as WordProficiency[] | null)?.forEach((p) => {
          profMap.set(p.word_id, p.level);
        });
      }
      setProficiencyMap(profMap);

      const weights = wordList.map((w) => calcWeight(w, profMap.get(w.id) ?? 1));
      setQueue(wordList.length ? buildWeightedQueue(weights, wordList.length) : []);

      setLoading(false);
    })();
  }, [setId]);

  const current = words[queue[pos]];
  const frontIsWord = FRONT_IS_WORD.includes(mode);

  const frontText = current ? (frontIsWord ? current.word : current.mean) : '';
  const backText = current ? (frontIsWord ? current.mean : current.word) : '';

  const progressPct = useMemo(
    () => (queue.length ? Math.round(((pos + 1) / queue.length) * 100) : 0),
    [pos, queue.length]
  );

// カードの反転アニメーション時間(CSS globals.cssの.card-flip-innerと合わせる)
  async function recordAndNext(level: number) {
    if (!current || transitioning) return;
    const isCorrect = level >= 4;
    setResults((r) => ({
      correct: r.correct + (isCorrect ? 1 : 0),
      wrong: r.wrong + (isCorrect ? 0 : 1),
    }));

    // 学習ログを記録し、単語ごとの現在の習熟度も更新する(失敗しても学習体験は止めない)
    supabase
      .from('study_logs')
      .insert({
        word_id: current.id,
        set_id: setId,
        mode,
        is_correct: isCorrect,
        level,
      })
      .then(() => {});

    supabase
      .from('word_proficiency')
      .upsert(
        { word_id: current.id, level, updated_at: new Date().toISOString() },
        { onConflict: 'word_id' }
      )
      .then(() => {});

    setProficiencyMap((m) => {
      const next = new Map(m);
      next.set(current.id, level);
      return next;
    });

    // 先にカードを裏返す(このときはまだ現在の単語のまま)。
    // 単語の切り替えはアニメーションが完全に終わってから行う。
    // 同時に切り替えると、裏返っている途中で次の単語の答えが見えてしまうため。
    setTransitioning(true);
    setFlipped(false);
    setTimeout(() => {
      if (pos + 1 >= queue.length) {
        setFinished(true);
      } else {
        setPos((p) => p + 1);
      }
      setTransitioning(false);
    }, FLIP_ANIMATION_MS);
  }

  function restart() {
    const weights = words.map((w) => calcWeight(w, proficiencyMap.get(w.id) ?? 1));
    setQueue(words.length ? buildWeightedQueue(weights, words.length) : []);
    setPos(0);
    setFlipped(false);
    setTransitioning(false);
    setResults({ correct: 0, wrong: 0 });
    setFinished(false);
  }

  return (
    <main>
      <NavHeader />
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => router.push('/')}
          className="text-sm text-gray-500 hover:underline"
        >
          ← 単語帳選択に戻る
        </button>
        <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
          {MODE_LABELS[mode]}
        </span>
      </div>

      {set && <h1 className="mb-4 text-lg font-bold">{set.name}</h1>}

      {loading && <p className="text-gray-400">読み込み中...</p>}

      {!loading && queue.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          この単語帳にはまだ単語が登録されていません。
        </div>
      )}

      {!loading && queue.length > 0 && !finished && current && (
        <>
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-primary-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="mb-3 text-center text-sm text-gray-500">
            {pos + 1} / {queue.length}
          </p>

          <FlashCard
            word={current}
            frontText={frontText}
            backText={backText}
            remarks={current.remarks}
            flipped={flipped}
            onFlip={() => {
              if (!transitioning) setFlipped((f) => !f);
            }}
            wordSide={frontIsWord ? 'front' : 'back'}
            speechLang={set?.type === 'english' ? 'en-US' : 'ja-JP'}
          />

          {flipped ? (
            <div className="mt-6">
              <p className="mb-2 text-center text-xs text-gray-400">
                習熟度を5段階で自己評価してください
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {PROFICIENCY_LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() => recordAndNext(level)}
                    className={`rounded-xl py-3 text-xs font-semibold text-white transition active:scale-95 ${
                      level <= 2
                        ? 'bg-red-500'
                        : level === 3
                        ? 'bg-amber-500'
                        : 'bg-green-600'
                    }`}
                  >
                    <span className="block text-base">{level}</span>
                    {PROFICIENCY_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-gray-400">
              カードをタップして答えを確認してください
            </p>
          )}
        </>
      )}

      {finished && (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <h2 className="mb-2 text-xl font-bold">おつかれさまでした！</h2>
          <p className="mb-4 text-gray-500">
            習熟度4以上 {results.correct} / {queue.length}
            (良好率{' '}
            {queue.length ? Math.round((results.correct / queue.length) * 100) : 0}
            %)
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={restart}
              className="rounded-xl bg-primary-600 px-5 py-2 font-semibold text-white"
            >
              もう一度
            </button>
            <button
              onClick={() => router.push('/')}
              className="rounded-xl bg-gray-200 px-5 py-2 font-semibold text-gray-700"
            >
              単語帳選択に戻る
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
