// 出題セッション(出題キューと、どこまで回答したか)の状態遷移。画面から切り離した純粋な関数にしてある。
//
// 「前の単語に戻る」は、直前の回答を取り消す動き(アンドゥ)として実装している:
//   - 戻ると、その単語の回答はなかったことになる(正答数・習熟度・学習記録を元に戻す)
//   - 回答した時にキューへ挿入した「出し直し」の単語も、一緒に取り除く
//   - 何回でも戻れる(回答した順に、新しいものから)

export interface HistoryEntry {
  wordId: string;
  pos: number; // この回答をした時の、キュー上の位置
  level: number; // 付けた習熟度(1〜5)
  prevLevel: number | null; // 回答前の習熟度(未評価ならnull)
  insertedAt: number | null; // 出し直しとしてキューに挿入した位置(挿入していなければnull)
  isCorrect: boolean;
}

export interface SessionState {
  queue: string[];
  pos: number;
  finished: boolean;
  history: HistoryEntry[];
  results: { correct: number; wrong: number };
  requeueCounts: Record<string, number>; // 単語ごとの出し直し回数(出し直しすぎないための上限管理)
  levels: Record<string, number>; // 現在の習熟度(未評価の単語は含まれない)
}

// 自己評価が低かった単語を、同じ学習中にもう一度出すための設定。
//   gapMin〜gapMax: 何問あとに出すか / max: 1回の学習で、最大何回まで出し直すか
export const REQUEUE_PLAN: Record<number, { gapMin: number; gapMax: number; max: number }> = {
  1: { gapMin: 3, gapMax: 5, max: 3 },
  2: { gapMin: 6, gapMax: 9, max: 2 },
  3: { gapMin: 12, gapMax: 18, max: 1 },
};

export function createSession(queue: string[], levels: Record<string, number>): SessionState {
  return {
    queue,
    pos: 0,
    finished: false,
    history: [],
    results: { correct: 0, wrong: 0 },
    requeueCounts: {},
    levels: { ...levels },
  };
}

export function currentWordId(state: SessionState): string | undefined {
  return state.finished ? undefined : state.queue[state.pos];
}

// 回答して次へ進む。rng は 0以上1未満の乱数(テストで固定できるよう引数にしてある)
export function answer(state: SessionState, level: number, rng: () => number = Math.random): SessionState {
  const wordId = state.queue[state.pos];
  if (state.finished || wordId === undefined) return state;

  const isCorrect = level >= 4;
  let queue = state.queue;
  let history = state.history;
  const requeueCounts = { ...state.requeueCounts };
  let insertedAt: number | null = null;

  // 自己評価が低い単語は、この学習中にもう一度出す(低いほど早く・多く)
  const plan = REQUEUE_PLAN[level];
  if (plan) {
    const done = requeueCounts[wordId] ?? 0;
    if (done < plan.max) {
      const gap = plan.gapMin + Math.floor(rng() * (plan.gapMax - plan.gapMin + 1));
      const at = Math.min(state.pos + 1 + gap, queue.length);
      queue = [...queue.slice(0, at), wordId, ...queue.slice(at)];
      requeueCounts[wordId] = done + 1;
      insertedAt = at;
      // 挿入位置より後ろにある、過去の回答の「挿入位置」を1つずらす
      history = history.map((h) =>
        h.insertedAt !== null && h.insertedAt >= at ? { ...h, insertedAt: h.insertedAt + 1 } : h
      );
    }
  }

  const entry: HistoryEntry = {
    wordId,
    pos: state.pos,
    level,
    prevLevel: state.levels[wordId] ?? null,
    insertedAt,
    isCorrect,
  };

  return {
    queue,
    pos: state.pos + 1 >= queue.length ? state.pos : state.pos + 1,
    finished: state.pos + 1 >= queue.length,
    history: [...history, entry],
    results: {
      correct: state.results.correct + (isCorrect ? 1 : 0),
      wrong: state.results.wrong + (isCorrect ? 0 : 1),
    },
    requeueCounts,
    levels: { ...state.levels, [wordId]: level },
  };
}

export function canUndo(state: SessionState): boolean {
  return state.history.length > 0;
}

// 直前の回答を取り消して、その単語に戻る。戻れない(まだ1問も答えていない)ときはnull。
export function undo(state: SessionState): { state: SessionState; entry: HistoryEntry } | null {
  const entry = state.history[state.history.length - 1];
  if (!entry) return null;

  let queue = state.queue;
  let history = state.history.slice(0, -1);
  const requeueCounts = { ...state.requeueCounts };

  // 回答した時に挿入した「出し直し」を取り除く
  if (entry.insertedAt !== null && queue[entry.insertedAt] === entry.wordId) {
    const at = entry.insertedAt;
    queue = [...queue.slice(0, at), ...queue.slice(at + 1)];
    const remaining = (requeueCounts[entry.wordId] ?? 1) - 1;
    if (remaining > 0) requeueCounts[entry.wordId] = remaining;
    else delete requeueCounts[entry.wordId]; // 0回に戻ったら、記録自体を消して元の状態と一致させる
    history = history.map((h) =>
      h.insertedAt !== null && h.insertedAt > at ? { ...h, insertedAt: h.insertedAt - 1 } : h
    );
  }

  const levels = { ...state.levels };
  if (entry.prevLevel === null) delete levels[entry.wordId];
  else levels[entry.wordId] = entry.prevLevel;

  return {
    entry,
    state: {
      queue,
      pos: entry.pos,
      finished: false,
      history,
      results: {
        correct: Math.max(state.results.correct - (entry.isCorrect ? 1 : 0), 0),
        wrong: Math.max(state.results.wrong - (entry.isCorrect ? 0 : 1), 0),
      },
      requeueCounts,
      levels,
    },
  };
}

// 現在の単語をアーカイブしたとき: この学習のキューから、その単語を全て取り除く。
// 回答済みの記録(アンドゥ用)も、その単語の分は取り消せなくなる。
export function archiveWord(state: SessionState, wordId: string): SessionState {
  const removed = new Set<number>();
  state.queue.forEach((id, i) => {
    if (id === wordId) removed.add(i);
  });
  if (removed.size === 0) return state;

  const shift = (i: number) => {
    let n = 0;
    removed.forEach((r) => {
      if (r < i) n += 1;
    });
    return i - n;
  };

  const queue = state.queue.filter((id) => id !== wordId);
  const history = state.history
    .filter((h) => h.wordId !== wordId)
    .map((h) => ({
      ...h,
      pos: shift(h.pos),
      insertedAt: h.insertedAt === null || removed.has(h.insertedAt) ? null : shift(h.insertedAt),
    }));

  let pos = Math.max(state.pos - Array.from(removed).filter((r) => r < state.pos).length, 0);
  const requeueCounts = { ...state.requeueCounts };
  delete requeueCounts[wordId];

  // 現在位置がキューの外に出たら終了扱い。位置は(answerと同じく)最後の単語に置く
  const finished = state.finished || pos >= queue.length;
  if (pos >= queue.length) pos = Math.max(queue.length - 1, 0);

  return { ...state, queue, pos, finished, history, requeueCounts };
}
