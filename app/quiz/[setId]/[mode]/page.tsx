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
import {
  enqueuePendingAction,
  getOfflineSet,
  removeWordFromOfflineCache,
  saveOfflineSet,
  updateOfflineProficiency,
} from '@/lib/offlineStore';

const FRONT_IS_WORD: QuizMode[] = ['en_to_jp', 'ko_to_gen'];

// 重要度・難易度・習熟度から出題の重みを計算する。
// - importance(重要度 1〜5): 数値が上がるほど「掛け算」で効くようにし、
//   1→1.0倍 / 2→1.5倍 / 3→2.0倍 / 4→2.5倍 / 5→3.0倍 と、重要度が高い単語ほど
//   出現頻度が加速度的に増えるようにしている。
// - difficulty(難易度 1〜5、未判定は3扱い): 高いほど出やすい
// - proficiencyLevel(習熟度 1〜5、未評価は1=最も苦手扱い): 低いほど出やすい(x2で重視)
function calcWeight(word: Word, proficiencyLevel: number): number {
  const difficulty = word.difficulty ?? 3;
  const proficiencyFactor = (6 - proficiencyLevel) * 2;
  const importanceMultiplier = 0.5 + word.importance * 0.5; // 1→1.0 ... 5→3.0
  const weight = (difficulty + proficiencyFactor) * importanceMultiplier;
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

// 重み付きの重複ありサンプリングでcount件分の出題順(単語IDの配列)を作る。
// 同じ単語が連続しないよう簡易的に1回だけ引き直す。
function buildWeightedQueue(words: Word[], weights: number[], count: number): string[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const queue: string[] = [];
  let prevIndex = -1;
  for (let i = 0; i < count; i++) {
    let idx = pickWeightedIndex(weights, total);
    if (idx === prevIndex && weights.length > 1) {
      idx = pickWeightedIndex(weights, total);
    }
    queue.push(words[idx].id);
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
  const [queue, setQueue] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ correct: number; wrong: number }>({
    correct: 0,
    wrong: 0,
  });
  const [finished, setFinished] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoadError(null);

      // オンラインならまずSupabaseから最新を取りに行く。失敗したらオフラインキャッシュにフォールバック。
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const { data: setData, error: setErr } = await supabase
            .from('word_sets')
            .select('*')
            .eq('id', setId)
            .single();
          const { data: wordData, error: wordErr } = await supabase
            .from('words')
            .select('*')
            .eq('set_id', setId)
            .eq('archived', false);

          if (setErr || wordErr || !setData) throw new Error(setErr?.message ?? wordErr?.message);

          const wordList = (wordData as Word[]) ?? [];
          setSet(setData as WordSet);
          setWords(wordList);

          let profMap = new Map<string, number>();
          if (wordList.length > 0) {
            const { data: profData } = await supabase
              .from('word_proficiency')
              .select('*')
              .in('word_id', wordList.map((w) => w.id));
            (profData as WordProficiency[] | null)?.forEach((p) => {
              profMap.set(p.word_id, p.level);
            });
          }
          setProficiencyMap(profMap);

          const weights = wordList.map((w) => calcWeight(w, profMap.get(w.id) ?? 1));
          setQueue(wordList.length ? buildWeightedQueue(wordList, weights, wordList.length) : []);
          setIsOfflineMode(false);

          // 次回オフラインでも使えるよう、取得できたデータでローカルキャッシュも更新しておく
          const proficiencyObj: Record<string, number> = {};
          profMap.forEach((v, k) => (proficiencyObj[k] = v));
          saveOfflineSet({
            setId,
            setName: (setData as WordSet).name,
            setType: (setData as WordSet).type,
            words: wordList,
            proficiency: proficiencyObj,
            downloadedAt: new Date().toISOString(),
          });

          setLoading(false);
          return;
        } catch {
          // 通信エラーなどの場合はオフラインキャッシュにフォールバックする
        }
      }

      // オフライン、またはオンライン取得に失敗した場合はローカルキャッシュを使う
      const offline = getOfflineSet(setId);
      if (offline) {
        setSet({
          id: offline.setId,
          name: offline.setName,
          type: offline.setType,
          description: null,
          created_at: offline.downloadedAt,
        });
        setWords(offline.words);
        const profMap = new Map<string, number>(Object.entries(offline.proficiency));
        setProficiencyMap(profMap);
        const weights = offline.words.map((w) => calcWeight(w, profMap.get(w.id) ?? 1));
        setQueue(offline.words.length ? buildWeightedQueue(offline.words, weights, offline.words.length) : []);
        setIsOfflineMode(true);
      } else {
        setLoadError(
          'オフラインで、この単語帳のダウンロード済みデータもありません。Wi-Fiがある時にホーム画面から「オフライン用にダウンロード」しておいてください。'
        );
      }
      setLoading(false);
    })();
  }, [setId]);

  const current = words.find((w) => w.id === queue[pos]);
  const frontIsWord = FRONT_IS_WORD.includes(mode);

  const frontText = current ? (frontIsWord ? current.word : current.mean) : '';
  const backText = current ? (frontIsWord ? current.mean : current.word) : '';

  // 発音記号は英単語(word)側にのみ紐づく
  const frontPhonetic = current && frontIsWord ? current.phonetic : null;
  const backPhonetic = current && !frontIsWord ? current.phonetic : null;

  const progressPct = useMemo(
    () => (queue.length ? Math.round(((pos + 1) / queue.length) * 100) : 0),
    [pos, queue.length]
  );

  function speakCurrent() {
    if (!current || !set || typeof window === 'undefined' || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(current.word);
    utterance.lang = set.type === 'english' ? 'en-US' : 'ja-JP';
    window.speechSynthesis.cancel(); // 前の発音が残らないようにする
    window.speechSynthesis.speak(utterance);
  }

  async function recordAndNext(level: number) {
    if (!current) return;
    const isCorrect = level >= 4;
    setResults((r) => ({
      correct: r.correct + (isCorrect ? 1 : 0),
      wrong: r.wrong + (isCorrect ? 0 : 1),
    }));

    const online = typeof navigator !== 'undefined' && navigator.onLine;

    if (online) {
      // 学習ログを記録し、単語ごとの現在の習熟度も更新する(失敗しても学習体験は止めない)
      supabase
        .from('study_logs')
        .insert({ word_id: current.id, set_id: setId, mode, is_correct: isCorrect, level })
        .then(() => {});
      supabase
        .from('word_proficiency')
        .upsert(
          { word_id: current.id, level, updated_at: new Date().toISOString() },
          { onConflict: 'word_id' }
        )
        .then(() => {});
    } else {
      // オフライン時は未送信キューに積んでおき、オンライン復帰時にまとめて送信する
      enqueuePendingAction({
        type: 'study_log',
        payload: { word_id: current.id, set_id: setId, mode, is_correct: isCorrect, level },
      });
      enqueuePendingAction({
        type: 'proficiency',
        payload: { word_id: current.id, level, updated_at: new Date().toISOString() },
      });
    }

    updateOfflineProficiency(setId, current.id, level);
    setProficiencyMap((m) => {
      const next = new Map(m);
      next.set(current.id, level);
      return next;
    });

    if (pos + 1 >= queue.length) {
      setFinished(true);
    } else {
      setPos((p) => p + 1);
      setFlipped(false);
    }
  }

  async function archiveCurrent() {
    if (!current) return;
    if (!confirm(`「${current.word}」をアーカイブして出題対象から外しますか？`)) return;

    const wordId = current.id;
    setArchiving(true);

    // このセッション中、この単語が今後(前方も含め)出題キューに出てこないようにする
    const removedBeforePos = queue.slice(0, pos).filter((id) => id === wordId).length;
    const newQueue = queue.filter((id) => id !== wordId);
    const newWords = words.filter((w) => w.id !== wordId);
    const newPos = Math.max(pos - removedBeforePos, 0);

    setWords(newWords);
    setQueue(newQueue);
    setPos(newPos);
    setFlipped(false);
    if (newPos >= newQueue.length) setFinished(true);

    const online = typeof navigator !== 'undefined' && navigator.onLine;
    if (online) {
      try {
        await fetch('/api/words/archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [wordId], archived: true }),
        });
      } catch {
        enqueuePendingAction({ type: 'archive', payload: { ids: [wordId], archived: true } });
      }
    } else {
      enqueuePendingAction({ type: 'archive', payload: { ids: [wordId], archived: true } });
    }
    removeWordFromOfflineCache(setId, wordId);

    setArchiving(false);
  }

  function restart() {
    const weights = words.map((w) => calcWeight(w, proficiencyMap.get(w.id) ?? 1));
    setQueue(words.length ? buildWeightedQueue(words, weights, words.length) : []);
    setPos(0);
    setFlipped(false);
    setResults({ correct: 0, wrong: 0 });
    setFinished(false);
  }

  return (
    <main>
      <NavHeader />
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:underline">
          ← 単語帳選択に戻る
        </button>
        <div className="flex items-center gap-2">
          {isOfflineMode && (
            <span className="rounded-full bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-600">
              📴 オフラインデータ
            </span>
          )}
          <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
            {MODE_LABELS[mode]}
          </span>
        </div>
      </div>

      {set && <h1 className="mb-4 text-lg font-bold">{set.name}</h1>}

      {loading && <p className="text-gray-400">読み込み中...</p>}

      {!loading && loadError && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          {loadError}
        </div>
      )}

      {!loading && !loadError && queue.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white/60 p-6 text-center text-gray-500">
          出題できる単語がありません。(単語が未登録、または全てアーカイブ済みです)
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

          {/*
            key={current.id + pos} を付けてカードごとにDOMを作り直す。
            これにより「次の単語に進んだ瞬間、裏面(答え)にflipアニメーションが
            残っていて一瞬見えてしまう」バグを防ぐ(常にflipped=falseの状態から
            表示が開始される)。
          */}
          <FlashCard
            key={`${current.id}-${pos}`}
            word={current}
            frontText={frontText}
            backText={backText}
            frontPhonetic={frontPhonetic}
            backPhonetic={backPhonetic}
            remarks={current.remarks}
            flipped={flipped}
            onFlip={() => setFlipped((f) => !f)}
            onSpeak={speakCurrent}
          />

          <div className="mt-3 text-center">
            <button
              onClick={archiveCurrent}
              disabled={archiving}
              className="text-xs text-gray-400 hover:text-red-500 hover:underline disabled:opacity-50"
            >
              🗄 この単語をアーカイブする(出題対象から外す)
            </button>
          </div>

          {flipped ? (
            <div className="mt-4">
              <p className="mb-2 text-center text-xs text-gray-400">
                習熟度を5段階で自己評価してください
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {PROFICIENCY_LEVELS.map((level) => (
                  <button
                    key={level}
                    onClick={() => recordAndNext(level)}
                    className={`rounded-xl py-3 text-xs font-semibold text-white transition active:scale-95 ${
                      level <= 2 ? 'bg-red-500' : level === 3 ? 'bg-amber-500' : 'bg-green-600'
                    }`}
                  >
                    <span className="block text-base">{level}</span>
                    {PROFICIENCY_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-center text-sm text-gray-400">
              カードをタップして答えを確認してください
            </p>
          )}
        </>
      )}

      {finished && (
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
          <h2 className="mb-2 text-xl font-bold">おつかれさまでした！</h2>
          <p className="mb-4 text-gray-500">
            習熟度4以上 {results.correct} / {results.correct + results.wrong}
            (良好率{' '}
            {results.correct + results.wrong
              ? Math.round((results.correct / (results.correct + results.wrong)) * 100)
              : 0}
            %)
          </p>
          <div className="flex justify-center gap-3">
            <button onClick={restart} className="rounded-xl bg-primary-600 px-5 py-2 font-semibold text-white">
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
