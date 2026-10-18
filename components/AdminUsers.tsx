'use client';

import { FormEvent, useEffect, useState } from 'react';

type Role = 'user' | 'admin';

interface AppUser {
  id: string;
  username: string;
  role: Role;
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
  const [role, setRole] = useState<Role>('user');
  const [busy, setBusy] = useState(false);

  // パスワード変更中のユーザー
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

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
        body: JSON.stringify({ username, password, role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'ユーザーを追加できませんでした');
      } else {
        setMessage(`「${json.data.username}」を追加しました`);
        setUsername('');
        setPassword('');
        setRole('user');
        await loadUsers();
      }
    } catch {
      setError('通信に失敗しました');
    }
    setBusy(false);
  }

  async function handleDelete(user: AppUser) {
    if (
      !confirm(
        `ユーザー「${user.username}」を削除しますか?\n\n` +
          'このユーザーはログインできなくなり、登録した単語帳・単語・学習記録もすべて削除されます。元に戻せません。'
      )
    )
      return;
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

  async function handleChangeRole(user: AppUser) {
    const next: Role = user.role === 'admin' ? 'user' : 'admin';
    const label = next === 'admin' ? '管理者にします' : '一般ユーザーに戻します';
    if (!confirm(`「${user.username}」を${label}。よろしいですか?`)) return;
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '権限を変更できませんでした');
      } else {
        setMessage(`「${user.username}」を${next === 'admin' ? '管理者' : '一般ユーザー'}にしました`);
        await loadUsers();
      }
    } catch {
      setError('通信に失敗しました');
    }
  }

  async function handleChangePassword(e: FormEvent, user: AppUser) {
    e.preventDefault();
    setPwBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? 'パスワードを変更できませんでした');
      } else {
        setMessage(`「${user.username}」のパスワードを変更しました`);
        setEditingId(null);
        setNewPw('');
      }
    } catch {
      setError('通信に失敗しました');
    }
    setPwBusy(false);
  }

  return (
    <section className="mt-8 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <h2 className="mb-1 font-bold">ログインアカウント管理</h2>
      <p className="mb-3 text-xs text-gray-500">
        一般ユーザーはアプリを使えます。管理者はそれに加えて、この管理者画面に入れます。
        パスワードは8文字以上で、自由に変更できます(変更しても、ログイン済みの端末はログイン状態が続きます)。単語帳などのデータはユーザーごとに別々で、管理者でも中身は見られません。
      </p>

      <form onSubmit={handleAdd} className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
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
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="user">一般ユーザー</option>
          <option value="admin">管理者</option>
        </select>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? '追加中...' : '追加'}
        </button>
      </form>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {message && <p className="mb-2 text-sm text-green-700">{message}</p>}

      {loading && <p className="text-sm text-gray-400">読み込み中...</p>}
      {!loading && (
        <ul className="divide-y divide-gray-100">
          {users.map((u) => (
            <li key={u.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{u.username}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                      u.role === 'admin' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {u.role === 'admin' ? '管理者' : '一般'}
                  </span>
                  {u.is_current && (
                    <span className="ml-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
                      ログイン中
                    </span>
                  )}
                  <span className="ml-2 text-xs text-gray-400">
                    {new Date(u.created_at).toLocaleDateString('ja-JP')} 追加
                  </span>
                </div>
                <div className="flex gap-3 text-xs">
                  <button
                    onClick={() => {
                      setEditingId(editingId === u.id ? null : u.id);
                      setNewPw('');
                      setError(null);
                      setMessage(null);
                    }}
                    className="text-primary-700 hover:underline"
                  >
                    パスワード変更
                  </button>
                  {u.is_current ? (
                    <span className="text-gray-300">権限変更・削除不可</span>
                  ) : (
                    <>
                      <button onClick={() => handleChangeRole(u)} className="text-primary-700 hover:underline">
                        {u.role === 'admin' ? '一般に戻す' : '管理者にする'}
                      </button>
                      <button onClick={() => handleDelete(u)} className="text-red-500 hover:underline">
                        削除
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingId === u.id && (
                <form
                  onSubmit={(e) => handleChangePassword(e, u)}
                  className="mt-2 flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder={`「${u.username}」の新しいパスワード(8文字以上)`}
                    autoComplete="new-password"
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={pwBusy}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {pwBusy ? '変更中...' : '変更する'}
                  </button>
                </form>
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
