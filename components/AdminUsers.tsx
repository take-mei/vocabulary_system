'use client';

import { FormEvent, useEffect, useState } from 'react';

interface AppUser {
  id: string;
  username: string;
  created_at: string;
  is_current: boolean;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'ユーザー一覧を取得できませんでした');
      } else {
        setUsers(json.data as AppUser[]);
        setError(null);
      }
    } catch {
      setError('通信に失敗しました');
    }
    setLoading(false);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'ユーザーを追加できませんでした');
      } else {
        setMessage(`「${json.data.username}」を追加しました`);
        setUsername('');
        setPassword('');
        await loadUsers();
      }
    } catch {
      setError('通信に失敗しました');
    }
    setBusy(false);
  }

  async function handleDelete(user: AppUser) {
    if (!confirm(`ユーザー「${user.username}」を削除しますか?\n(このユーザーはログインできなくなります)`)) return;
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'ユーザーを削除できませんでした');
      } else {
        setMessage(`「${user.username}」を削除しました`);
        await loadUsers();
      }
    } catch {
      setError('通信に失敗しました');
    }
  }

  return (
    <section className="mt-8 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-1 font-bold">ログインユーザー管理</h2>
      <p className="mb-3 text-xs text-gray-500">
        アプリにログインできるID/パスワードを追加・削除します。パスワードは8文字以上。パスワードを変更したい場合は、いったん削除して追加し直してください。
      </p>

      <form onSubmit={handleAdd} className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="ID(3〜50文字)"
          autoComplete="off"
          autoCapitalize="none"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード(8文字以上)"
          autoComplete="new-password"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? '追加中...' : 'ユーザーを追加'}
        </button>
      </form>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-2 text-sm text-green-700">{message}</p>}

      {loading && <p className="text-sm text-gray-400">読み込み中...</p>}
      {!loading && (
        <ul className="divide-y divide-gray-100">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-semibold">{u.username}</span>
                {u.is_current && (
                  <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
                    ログイン中
                  </span>
                )}
                <span className="ml-2 text-xs text-gray-400">
                  {new Date(u.created_at).toLocaleDateString('ja-JP')} 追加
                </span>
              </div>
              {u.is_current ? (
                <span className="text-xs text-gray-300">削除不可</span>
              ) : (
                <button onClick={() => handleDelete(u)} className="text-xs text-red-500 hover:underline">
                  削除
                </button>
              )}
            </li>
          ))}
          {users.length === 0 && !error && (
            <li className="py-2 text-sm text-gray-400">ユーザーがいません</li>
          )}
        </ul>
      )}
    </section>
  );
}
