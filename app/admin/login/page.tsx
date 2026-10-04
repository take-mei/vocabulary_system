'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

export default function AdminLoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? '認証に失敗しました');
        setLoading(false);
        return;
      }
      // オープンリダイレクト対策: /admin 配下の相対パスのみ許可
      const next = new URLSearchParams(window.location.search).get('next');
      const dest = next && /^\/admin(\/|\?|$)/.test(next) && !next.startsWith('//') ? next : '/admin';
      window.location.href = dest;
    } catch {
      setError('通信に失敗しました。ネットワークを確認してください');
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-1 text-center text-xl font-bold text-primary-700">🔒 管理者認証</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        管理者画面に入るには管理者パスワードが必要です
      </p>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5"
      >
        <div>
          <label htmlFor="admin-password" className="mb-1 block text-sm font-semibold">
            管理者パスワード
          </label>
          <input
            id="admin-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base"
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-primary-600 py-2.5 font-semibold text-white transition hover:bg-primary-700 active:scale-95 disabled:opacity-50"
        >
          {loading ? '確認中...' : '管理者画面へ'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm">
        <Link href="/" className="text-primary-600 hover:underline">← ホームに戻る</Link>
      </p>
    </main>
  );
}
