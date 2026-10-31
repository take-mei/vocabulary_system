'use client';

import { FormEvent, ReactNode, useState } from 'react';
import { Word, WordSetType } from '@/lib/types';

export type WordView = 'card' | 'list';

// 単語の一覧(カード形式/リスト形式)。設定・チェックした単語・アーカイブからテスト作成の3画面で共通に使う。
// どの単語でも次の操作ができる:
//   ☆/★ チェックの付け外し / アーカイブ・アーカイブの取り消し / 編集 / 削除
// 操作はこの部品の中でAPIを呼び、結果は onChange(更新後の単語) / onRemove(削除した単語のID) で親に知らせる。
interface WordListProps {
  words: Word[];
  view: WordView;
  // 単語が属する単語帳の種類(英単語/古文単語)。バッジ・発音再生・発音記号の入力欄に使う
  typeOf: (word: Word) => WordSetType | undefined;
  showTypeBadge?: boolean;
  // true: カード形式では答え(意味)を隠し、タップで表示する(見返し用)
  hideMeaning?: boolean;
  revealAll?: boolean;
  // 選択(チェックボックス)を付ける場合に渡す
  selection?: { selectedIds: Set<string>; onToggle: (id: string) => void };
  // 単語の下に表示する追加情報・ボタン(設定画面の難易度・発音記号の取得など)
  renderMeta?: (word: Word) => ReactNode;
  onChange: (word: Word) => void;
  onRemove: (id: string) => void;
}

export default function WordList(props: WordListProps) {
  const { words, view } = props;
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  function toggleReveal(id: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className={
        view === 'card'
          ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
          : 'divide-y divide-gray-100 rounded-2xl bg-white shadow-sm ring-1 ring-black/5'
      }
    >
      {words.map((w) => (
        <WordRow
          key={w.id}
          word={w}
          open={!props.hideMeaning || props.revealAll || revealed.has(w.id)}
          onToggleReveal={() => toggleReveal(w.id)}
          {...props}
        />
      ))}
    </div>
  );
}

function WordRow({
  word,
  view,
  typeOf,
  showTypeBadge,
  hideMeaning,
  open,
  onToggleReveal,
  selection,
  renderMeta,
  onChange,
  onRemove,
}: WordListProps & { word: Word; open: boolean; onToggleReveal: () => void }) {
  const type = typeOf(word);
  const isCard = view === 'card';
  // 見返し用(答えを隠す)のカードだけ、タップで答えを出し入れする。それ以外は常に全部表示
  const tapToReveal = isCard && !!hideMeaning;
  const showMeaning = !tapToReveal || open;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ word: '', mean: '', remarks: '', importance: 3, phonetic: '' });

  async function update(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/words/${word.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '保存できませんでした');
        return false;
      }
      onChange(json.data as Word);
      return true;
    } catch {
      setError('通信に失敗しました');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`「${word.word}」を削除しますか?\n(学習記録も消え、元に戻せません。残したまま出題だけ止めたい場合は「アーカイブ」を使ってください)`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/words/${word.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) {
        onRemove(word.id);
        return;
      }
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? '削除できませんでした');
    } catch {
      setError('通信に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setForm({
      word: word.word,
      mean: word.mean,
      remarks: word.remarks ?? '',
      importance: word.importance ?? 3,
      phonetic: word.phonetic ?? '',
    });
    setError(null);
    setEditing(true);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!form.word.trim() || !form.mean.trim()) {
      setError('単語と意味は空にできません');
      return;
    }
    const ok = await update({
      word: form.word.trim(),
      mean: form.mean.trim(),
      remarks: form.remarks.trim() || null,
      importance: form.importance,
      ...(type === 'english' ? { phonetic: form.phonetic.trim() || null } : {}),
    });
    if (ok) setEditing(false);
  }

  function speak() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(word.word);
    utterance.lang = type === 'kobun' ? 'ja-JP' : 'en-US';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  const containerClass = isCard
    ? `relative rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 ${tapToReveal ? 'cursor-pointer transition hover:shadow-md' : ''} ${word.archived ? 'opacity-70' : ''}`
    : `p-3 ${word.archived ? 'bg-gray-50/70' : ''}`;

  const actionButton = 'rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50';

  if (editing) {
    const inputClass = 'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm';
    return (
      <form onSubmit={saveEdit} className={`${containerClass} space-y-2`}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={form.word}
            onChange={(e) => setForm({ ...form, word: e.target.value })}
            placeholder="単語"
            className={inputClass}
            required
          />
          <input
            value={form.mean}
            onChange={(e) => setForm({ ...form, mean: e.target.value })}
            placeholder="意味"
            className={inputClass}
            required
          />
          <input
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            placeholder="備考(任意)"
            className={inputClass}
          />
          <select
            value={form.importance}
            onChange={(e) => setForm({ ...form, importance: Number(e.target.value) })}
            className={inputClass}
            title="重要度(出題頻度に影響。5が最も高頻度)"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                重要度 {n}
              </option>
            ))}
          </select>
          {type === 'english' && (
            <input
              value={form.phonetic}
              onChange={(e) => setForm({ ...form, phonetic: e.target.value })}
              placeholder="発音記号(例: /əˈbaʊt/)"
              className={inputClass}
            />
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className={`${actionButton} bg-primary-600 text-white`}>
            {busy ? '保存中...' : '保存'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`${actionButton} bg-gray-100 text-gray-600`}
          >
            キャンセル
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className={containerClass}
      onClick={tapToReveal ? onToggleReveal : undefined}
      data-word-id={word.id}
    >
      <div className="flex items-start gap-3">
        {selection && (
          <input
            type="checkbox"
            checked={selection.selectedIds.has(word.id)}
            onChange={() => selection.onToggle(word.id)}
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5"
            aria-label={`${word.word}を選択`}
          />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`font-bold ${isCard ? 'text-xl leading-snug' : ''}`}>{word.word}</span>
            {word.phonetic && <span className="text-xs text-gray-400">[{word.phonetic}]</span>}
            {showTypeBadge && type && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  type === 'english' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {type === 'english' ? '英単語' : '古文単語'}
              </span>
            )}
            {word.archived && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">アーカイブ済</span>
            )}
          </div>

          {showMeaning ? (
            <div className="mt-1">
              <p className="text-sm text-gray-800">{word.mean}</p>
              {word.remarks && <p className="text-xs text-gray-400">{word.remarks}</p>}
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-300">タップして答えを見る</p>
          )}

          {renderMeta && <div onClick={(e) => e.stopPropagation()}>{renderMeta(word)}</div>}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            speak();
          }}
          className="rounded-full bg-gray-100 p-1.5 text-sm leading-none hover:bg-gray-200"
          aria-label="発音を再生"
        >
          🔊
        </button>
      </div>

      {/* 操作(どの単語でも、チェック・アーカイブ・編集・削除ができる) */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => update({ checked: !word.checked })}
          disabled={busy}
          className={`${actionButton} ${
            word.checked ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {word.checked ? '★ チェック中' : '☆ チェック'}
        </button>
        <button
          onClick={() => update({ archived: !word.archived })}
          disabled={busy}
          className={`${actionButton} ${
            word.archived ? 'bg-primary-50 text-primary-700' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {word.archived ? '↩ アーカイブを取り消す' : '📦 アーカイブ'}
        </button>
        <button onClick={startEdit} disabled={busy} className={`${actionButton} bg-gray-100 text-gray-500`}>
          ✏️ 編集
        </button>
        <button onClick={handleDelete} disabled={busy} className={`${actionButton} bg-red-50 text-red-500`}>
          🗑 削除
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
