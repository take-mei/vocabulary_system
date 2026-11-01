'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  answer as sessionAnswer,
  archiveWord,
  canUndo,
  createSession,
  SessionState,
  undo as sessionUndo,
} from '@/lib/quizSession';
import {
  enqueuePendingAction,
  getOfflineSet,
  getPendingCount,
  removeWordFromOfflineCache,
  saveOfflineSet,
  updateOfflineChecked,
  updateOfflineProficiency,
} from '@/lib/offlineStore';

const FRONT_IS_WORD: QuizMode[] = ['en_to_jp', 'ko_to_gen'];

// 習熟度(自己評価1〜5)ごとの出やすさ。数字が小さい(苦手)ほど、掛け算で大きく効く。
//   1(全然だめ)=8倍 / 2=4倍 / 3=2倍 / 4=1倍 / 5(バッチリ)=0.4倍
// => 1と5では20倍の差。バッチリの単語はほとんど出ず、苦手な単語が何度も出る。
const LEVEL_FACTOR: Record<number, number> = { 1: 8, 2: 4, 3: 2, 4: 1, 5: 0.4 };

// 重要度・難易度・習熟度から出題の重みを計算する。
// - proficiencyLevel(習熟度 1〜5、未評価は1=最も苦手扱い): 上の表のとおり、最も強く効く
// - importance(重要度 1〜5): 1→1.0倍 / 2→1.5倍 / 3→2.0倍 / 4→2.5倍 / 5→3.0倍
// - difficulty(難易度 1〜5、未判定は3扱い): 1→0.85倍 〜 5→1.45倍(補助的に効く)
function calcWeight(word: Word, proficiencyLevel: number): number {
  const levelFactor = LEVEL_FACTOR[proficiencyLevel] ?? LEVEL_FACTOR[1];
  const difficultyFactor = 0.7 + (word.difficulty ?? 3) * 0.15;
  const importanceMultiplier = 0.5 + word.importance * 0.5;
  return levelFactor * difficultyFactor * importanceMultiplier;
}

// 右へスワイプして、前の単語に戻る操作の判定
const SWIPE_MIN_DISTANCE = 70; // これ以上(px)右へ動かしたらスワイプとみなす
const SWIPE_MAX_MS = 1000; // これより長くかけた(ゆっくりした)動きは、スワイプとみなさない
const SWIPE_MAX_DRAG = 110; // 指に合わせてカードを動かす最大量(px)

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
  // 出題キュー・現在位置・回答の履歴・習熟度は、lib/quizSession.ts の状態としてまとめて持つ
  const [session, setSession] = useState<SessionState>(() => createSession([], {}));
  const { queue, pos, finished, results } = session;
  const [loading, setLoading] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // 学習記録の送信を、回答した順に1件ずつ行うための鎖(順番が入れ替わらないようにする)
  const sendChainRef = useRef<Promise<void>>(Promise.resolve());
  // スワイプ操作: 指を置いた位置・時刻と、いまカードを動かしている量
  const swipeRef = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const [dragX, setDragX] = useState(0);

  useEffect(() => {
    (async () => {
      setLoadError(null);

      // オンラインならまずSupabaseから最新を取りに行く。失敗したらオフラインキャッシュにフォールバック。
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const res = await fetch(`/api/study?set_id=${encodeURIComponent(setId)}`);
          if (!res.ok) throw new Error('fetch failed');
          const json = await res.json();
          const setData = json.set as WordSet;
          const wordList = (json.words as Word[]) ?? [];
          setSet(setData);
          setWords(wordList);

          const levels = (json.proficiency ?? {}) as Record<string, number>;
          const weights = wordList.map((w) => calcWeight(w, levels[w.id] ?? 1));
          setSession(
            createSession(
              wordList.length ? buildWeightedQueue(wordList, weights, wordList.length) : [],
              levels
            )
          );
          setIsOfflineMode(false);

          // 次回オフラインでも使えるよう、取得できたデータでローカルキャッシュも更新しておく
          saveOfflineSet({
            setId,
            setName: (setData as WordSet).name,
            setType: (setData as WordSet).type,
            words: wordList,
            proficiency: levels,
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
        const levels = offline.proficiency;
        const weights = offline.words.map((w) => calcWeight(w, levels[w.id] ?? 1));
        setSession(
          createSession(
            offline.words.length ? buildWeightedQueue(offline.words, weights, offline.words.length) : [],
            levels
          )
        );
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

  // 学習記録の送信。回答した順番が入れ替わらないよう1件ずつ送り、
  // 送れなかった分(と、それ以降の分)はオフライン用の未送信キューに積む。
  function sendStudy(body: object, queueForLater: () => void) {
    sendChainRef.current = sendChainRef.current.then(async () => {
      const canSend = typeof navigator !== 'undefined' && navigator.onLine && getPendingCount() === 0;
      if (!canSend) {
        queueForLater();
        return;
      }
      try {
        const res = await fetch('/api/study', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        // 通信はできたが保存に失敗した場合は、後で再送できるようキューに積む(404=単語が無いので除く)
        if (!res.ok && res.status !== 404) queueForLater();
      } catch {
        queueForLater();
      }
    });
  }

  function recordAndNext(level: number) {
    if (!current || finished) return;
    const wordId = current.id;
    const next = sessionAnswer(session, level);
    const isCorrect = level >= 4;
    const updatedAt = new Date().toISOString();

    setSession(next);
    setFlipped(false);
    updateOfflineProficiency(setId, wordId, level);

    // 学習ログを記録し、単語ごとの現在の習熟度も更新する(失敗しても学習体験は止めない)
    sendStudy(
      {
        log: { word_id: wordId, mode, is_correct: isCorrect, level },
        proficiency: { word_id: wordId, level, updated_at: updatedAt },
      },
      () => {
        enqueuePendingAction({
          type: 'study_log',
          payload: { word_id: wordId, set_id: setId, mode, is_correct: isCorrect, level },
        });
        enqueuePendingAction({
          type: 'proficiency',
          payload: { word_id: wordId, level, updated_at: updatedAt },
        });
      }
    );
  }

  // 「前の単語に戻る」: 直前の回答を取り消して、その単語をもう一度出題する。
  // (正答数・習熟度・学習記録を回答前に戻し、出し直しとして追加していた分も取り除く)
  function goBack() {
    const result = sessionUndo(session);
    if (!result) return;
    const { state, entry } = result;

    setSession(state);
    setFlipped(false);
    updateOfflineProficiency(setId, entry.wordId, entry.prevLevel);

    const undoPayload = { word_id: entry.wordId, previous_level: entry.prevLevel };
    sendStudy({ undo: undoPayload }, () => {
      enqueuePendingAction({ type: 'undo', payload: undoPayload });
    });
  }

  // 右へスワイプして、前の単語に戻る(「← 前の単語に戻る」ボタンと同じ動き)。
  // 縦スクロールやタップ(カードをめくる操作)を邪魔しないよう、横方向に十分動かした時だけ反応する。
  // マウス操作は対象外(クリックでの操作を優先する)。
  function isSwipeBack(dx: number, dy: number, ms: number) {
    return dx >= SWIPE_MIN_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5 && ms <= SWIPE_MAX_MS;
  }

  function onSwipeStart(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') return;
    swipeRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now() };
  }

  function onSwipeMove(e: React.PointerEvent) {
    const start = swipeRef.current;
    if (!start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    // 横に動かしている間だけ、指に合わせてカードを少し動かす
    setDragX(canUndo(session) && dx > 10 && Math.abs(dx) > Math.abs(dy) * 1.5 ? Math.min(dx, SWIPE_MAX_DRAG) : 0);
  }

  function onSwipeEnd(e: React.PointerEvent) {
    const start = swipeRef.current;
    if (!start || start.id !== e.pointerId) return;
    swipeRef.current = null;
    setDragX(0);
    if (isSwipeBack(e.clientX - start.x, e.clientY - start.y, Date.now() - start.t)) goBack();
  }

  function onSwipeCancel() {
    swipeRef.current = null;
    setDragX(0);
  }

  // ☆/★: この単語を「チェックした単語」に入れる/外す
  async function toggleCheck() {
    if (!current) return;
    const wordId = current.id;
    const next = !current.checked;
    const payload = { ids: [wordId], checked: next };

    setWords((ws) => ws.map((w) => (w.id === wordId ? { ...w, checked: next } : w)));
    updateOfflineChecked(setId, wordId, next);

    const online = typeof navigator !== 'undefined' && navigator.onLine;
    if (!online) {
      enqueuePendingAction({ type: 'check', payload });
      return;
    }
    try {
      const res = await fetch('/api/words/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      // 保存に失敗した場合は、後で再送できるようキューに積む(404=単語が無いので除く)
      if (!res.ok && res.status !== 404) enqueuePendingAction({ type: 'check', payload });
    } catch {
      enqueuePendingAction({ type: 'check', payload });
    }
  }

  async function archiveCurrent() {
    if (!current) return;
    if (!confirm(`「${current.word}」をアーカイブして出題対象から外しますか？`)) return;

    const wordId = current.id;
    setArchiving(true);

    // このセッション中、この単語が今後(前方も含め)出題キューに出てこないようにする
    setWords((ws) => ws.filter((w) => w.id !== wordId));
    setSession((st) => archiveWord(st, wordId));
    setFlipped(false);

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
    const weights = words.map((w) => calcWeight(w, session.levels[w.id] ?? 1));
    setSession(
      createSession(words.length ? buildWeightedQueue(words, weights, words.length) : [], session.levels)
    );
    setFlipped(false);
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

      {/* スワイプ領域(touch-action: pan-y で、縦のスクロールはそのまま使える) */}
      <div
        onPointerDown={onSwipeStart}
        onPointerMove={onSwipeMove}
        onPointerUp={onSwipeEnd}
        onPointerCancel={onSwipeCancel}
        style={{ touchAction: 'pan-y' }}
      >
      {!loading && queue.length > 0 && !finished && current && (
        <>
          <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-primary-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
            <button
              onClick={goBack}
              disabled={!canUndo(session)}
              title="直前の回答を取り消して、前の単語に戻ります"
              className="rounded-lg px-2 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50 disabled:text-gray-300 disabled:hover:bg-transparent"
            >
              ← 前の単語に戻る
            </button>
            <span>
              {pos + 1} / {queue.length}
            </span>
            <span className="w-28" />
          </div>

          {/*
            key={current.id + pos} を付けてカードごとにDOMを作り直す。
            これにより「次の単語に進んだ瞬間、裏面(答え)にflipアニメーションが
            残っていて一瞬見えてしまう」バグを防ぐ(常にflipped=falseの状態から
            表示が開始される)。
          */}
          <div
            style={{
              transform: dragX ? `translateX(${dragX}px)` : undefined,
              opacity: dragX ? 1 - dragX / 300 : 1,
              transition: dragX ? 'none' : 'transform 0.2s, opacity 0.2s',
            }}
          >
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
            checked={!!current.checked}
            onToggleCheck={toggleCheck}
          />
          </div>

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
                習熟度を5段階で自己評価してください(低いほど、この後もう一度出ます)
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
              {canUndo(session) && (
                <span className="mt-1 block text-xs text-gray-300">右へスワイプで、前の単語に戻れます</span>
              )}
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
          <div className="flex flex-wrap justify-center gap-3">
            {canUndo(session) && (
              <button
                onClick={goBack}
                className="rounded-xl bg-white px-5 py-2 font-semibold text-primary-700 ring-1 ring-primary-600"
                title="最後の回答を取り消して、最後の単語に戻ります"
              >
                ← 最後の単語に戻る
              </button>
            )}
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
      </div>
    </main>
  );
}
