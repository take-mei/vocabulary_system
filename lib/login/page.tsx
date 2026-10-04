'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? 'ログインに失敗しました');
        setLoading(false);
        return;
      }
      // オープンリダイレクト対策: 同一サイト内の相対パスのみ許可
      const next = new URLSearchParams(window.location.search).get('next');
      const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      window.location.href = dest;
    } catch {
      setError('通信に失敗しました。ネットワークを確認してください');
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-1 text-center text-xl font-bold text-primary-700">📚 単語帳アプリ</h1>
      <p className="mb-6 text-center text-sm text-gray-500">ログインしてください</p>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5"
      >
        <div>
          <label htmlFor="username" className="mb-1 block text-sm font-semibold">ID</label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-base"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-semibold">パスワード</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
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
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </main>
  );
}
