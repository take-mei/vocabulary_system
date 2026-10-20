import { QuizMode, Word, WordSetType } from '@/lib/types';

// ブラウザのlocalStorageに単語帳データと「オンライン復帰時に送る操作」を貯めておくための
// 軽量なオフライン対応レイヤー。IndexedDBではなくlocalStorageを使っているのは、
// 単語帳の規模(多くても数百語)であればJSON文字列化しても十分軽量に収まるため。

const OFFLINE_SET_PREFIX = 'wordapp:offline-set:';
const PENDING_QUEUE_KEY = 'wordapp:pending-queue';

export interface OfflineSetData {
  setId: string;
  setName: string;
  setType: WordSetType;
  words: Word[]; // ダウンロード時点で archived=false だった単語のみ
  proficiency: Record<string, number>; // word_id -> 習熟度(1〜5)
  downloadedAt: string;
}

type PendingAction =
  | {
      id: string;
      type: 'study_log';
      payload: {
        word_id: string;
        set_id: string;
        mode: QuizMode;
        is_correct: boolean;
        level: number;
      };
    }
  | {
      id: string;
      type: 'proficiency';
      payload: { word_id: string; level: number; updated_at: string };
    }
  | {
      id: string;
      type: 'archive';
      payload: { ids: string[]; archived: boolean };
    }
  | {
      id: string;
      type: 'check';
      payload: { ids: string[]; checked: boolean };
    };

function hasWindow(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// --- 単語帳データのダウンロード/取得 ---

export function saveOfflineSet(data: OfflineSetData) {
  if (!hasWindow()) return;
  window.localStorage.setItem(`${OFFLINE_SET_PREFIX}${data.setId}`, JSON.stringify(data));
}

export function getOfflineSet(setId: string): OfflineSetData | null {
  if (!hasWindow()) return null;
  return safeParse<OfflineSetData | null>(
    window.localStorage.getItem(`${OFFLINE_SET_PREFIX}${setId}`),
    null
  );
}

export function listDownloadedSetIds(): string[] {
  if (!hasWindow()) return [];
  const ids: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(OFFLINE_SET_PREFIX)) {
      ids.push(key.slice(OFFLINE_SET_PREFIX.length));
    }
  }
  return ids;
}

// 単語帳全体(word_sets + 非アーカイブの単語 + 習熟度)をサーバー(APIの/api/study)から取得し、
// localStorageに保存する。Wi-Fiがある時にこれを呼んでおくことで、後でオフライン利用できる。
export async function downloadSetForOffline(
  setId: string
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/study?set_id=${encodeURIComponent(setId)}`);
    if (!res.ok) {
      throw new Error(res.status === 404 ? '単語帳が見つかりません' : 'ダウンロードに失敗しました');
    }
    const json = await res.json();
    const words = (json.words as Word[]) ?? [];

    saveOfflineSet({
      setId,
      setName: json.set.name,
      setType: json.set.type,
      words,
      proficiency: (json.proficiency as Record<string, number>) ?? {},
      downloadedAt: new Date().toISOString(),
    });

    return { ok: true, count: words.length };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'ダウンロードに失敗しました' };
  }
}

// オフライン中に単語を(見た目上)アーカイブする: ローカルキャッシュから取り除く
export function removeWordFromOfflineCache(setId: string, wordId: string) {
  const data = getOfflineSet(setId);
  if (!data) return;
  data.words = data.words.filter((w) => w.id !== wordId);
  saveOfflineSet(data);
}

// チェック(☆)の切り替えをローカルキャッシュにも反映する
export function updateOfflineChecked(setId: string, wordId: string, checked: boolean) {
  const data = getOfflineSet(setId);
  if (!data) return;
  data.words = data.words.map((w) => (w.id === wordId ? { ...w, checked } : w));
  saveOfflineSet(data);
}

// オフライン中に更新した習熟度をローカルキャッシュにも反映する
export function updateOfflineProficiency(setId: string, wordId: string, level: number) {
  const data = getOfflineSet(setId);
  if (!data) return;
  data.proficiency[wordId] = level;
  saveOfflineSet(data);
}

// --- 未送信キュー(オフライン中に行った操作を貯めておく) ---

function getQueue(): PendingAction[] {
  if (!hasWindow()) return [];
  return safeParse<PendingAction[]>(window.localStorage.getItem(PENDING_QUEUE_KEY), []);
}

function setQueue(queue: PendingAction[]) {
  if (!hasWindow()) return;
  window.localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue));
}

export function enqueuePendingAction(action: Omit<PendingAction, 'id'>) {
  const queue = getQueue();
  queue.push({ ...action, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` } as PendingAction);
  setQueue(queue);
}

export function getPendingCount(): number {
  return getQueue().length;
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// オンライン復帰時に呼び出し、キューに溜まった操作を1件ずつAPIに送信する。
// 失敗したものはキューに残し、成功したものだけ取り除く。
export async function flushPendingActions(): Promise<{ done: number; failed: number }> {
  if (!hasWindow() || !navigator.onLine) return { done: 0, failed: 0 };

  const queue = getQueue();
  if (queue.length === 0) return { done: 0, failed: 0 };

  const remaining: PendingAction[] = [];
  let done = 0;
  let failed = 0;

  for (const action of queue) {
    try {
      let res: Response;
      if (action.type === 'study_log') {
        res = await postJson('/api/study', { log: action.payload });
      } else if (action.type === 'proficiency') {
        res = await postJson('/api/study', { proficiency: action.payload });
      } else if (action.type === 'archive') {
        res = await postJson('/api/words/archive', action.payload);
      } else {
        res = await postJson('/api/words/check', action.payload);
      }
      // 404は「その単語がもう無い(削除された)」ので、再送しても無駄。キューから外す
      if (!res.ok && res.status !== 404) throw new Error('send failed');
      done += 1;
    } catch {
      failed += 1;
      remaining.push(action);
    }
  }

  setQueue(remaining);
  return { done, failed };
}

// --- ユーザーが切り替わった時に、前のユーザーのデータが残らないようにする ---

const OWNER_KEY = 'wordapp:owner';

// ブラウザに保存した単語帳データと未送信キューをすべて消す
export function clearOfflineData() {
  if (!hasWindow()) return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith('wordapp:')) keys.push(key);
  }
  keys.forEach((k) => window.localStorage.removeItem(k));
}

// ログイン直後に呼ぶ。前回と別のユーザーなら、前のユーザーのデータを消す。
export function prepareOfflineDataFor(username: string) {
  if (!hasWindow()) return;
  const owner = window.localStorage.getItem(OWNER_KEY);
  if (owner !== username) clearOfflineData();
  window.localStorage.setItem(OWNER_KEY, username);
}
