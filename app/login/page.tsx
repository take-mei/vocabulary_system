'use client';

import { FormEvent, useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { prepareOfflineDataFor } from '@/lib/offlineStore';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [passkeySupported, setPasskeySupported] = useState(false);
  const [signup, setSignup] = useState<{ enabled: boolean; codeRequired: boolean }>({
    enabled: false,
    codeRequired: false,
  });

  useEffect(() => {
    setPasskeySupported(browserSupportsWebAuthn());
    fetch('/api/auth/signup-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json) setSignup({ enabled: !!json.enabled, codeRequired: !!json.codeRequired });
      })
      .catch(() => {});
  }, []);

  // ログイン後の移動先。オープンリダイレクト対策: 同一サイト内の相対パスのみ許可
  function goNext(loggedInAs: string) {
    // 前回と別のユーザーなら、端末に残っている前のユーザーの単語データを消す
    prepareOfflineDataFor(loggedInAs);
    const next = new URLSearchParams(window.location.search).get('next');
    const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    window.location.href = dest;
  }

  async function postJson(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { res, json } = await postJson('/api/auth/login', { username, password });
      if (!res.ok) {
        setError(json.error ?? 'ログインに失敗しました');
        setLoading(false);
        return;
      }
      goNext(username.trim());
    } catch {
      setError('通信に失敗しました。ネットワークを確認してください');
      setLoading(false);
    }
  }

  async function handlePasskeyLogin() {
    setLoading(true);
    setError(null);
    try {
      const { res: optRes, json: options } = await postJson('/api/passkey/login/options');
      if (!optRes.ok) throw new Error('options');

      // 端末が、保存されているパスキーの選択と本人確認(指紋・顔・PINなど)を求める
      const assertion = await startAuthentication({ optionsJSON: options });

      const { res, json } = await postJson('/api/passkey/login/verify', { response: assertion });
      if (!res.ok) {
        setError(json.error ?? 'パスキーでログインできませんでした');
        setLoading(false);
        return;
      }
      goNext(json.username);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        setError('パスキーの認証がキャンセルされました');
      } else {
        setError('パスキーでログインできませんでした。パスワードでログインしてください');
      }
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError('パスワードが一致しません');
      return;
    }
    setLoading(true);
    try {
      const { res, json } = await postJson('/api/auth/register', { username, password, code });
      if (!res.ok) {
        setError(json.error ?? '登録に失敗しました');
        setLoading(false);
        return;
      }
      goNext(json.username ?? username.trim());
    } catch {
      setError('通信に失敗しました。ネットワークを確認してください');
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword('');
    setPasswordConfirm('');
  }

  const inputClass = 'w-full rounded-xl border border-gray-300 px-3 py-2 text-base';
  const primaryButton =
    'w-full rounded-xl bg-primary-600 py-2.5 font-semibold text-white transition hover:bg-primary-700 active:scale-95 disabled:opacity-50';

  return (
    <main className="mx-auto mt-16 max-w-sm">
      <h1 className="mb-1 text-center text-xl font-bold text-primary-700">📚 単語帳アプリ</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        {mode === 'login' ? 'ログインしてください' : '新規登録'}
      </p>

      {mode === 'login' ? (
        <div className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-semibold">ID</label>
              <input
                id="username"
                type="text"
                autoComplete="username webauthn"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
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
                className={inputClass}
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={loading} className={primaryButton}>
              {loading ? '処理中...' : 'パスワードでログイン'}
            </button>
          </form>

          {passkeySupported && (
            <>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="h-px flex-1 bg-gray-200" />
                または
                <span className="h-px flex-1 bg-gray-200" />
              </div>
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={loading}
                className="w-full rounded-xl bg-white py-2.5 font-semibold text-primary-700 ring-1 ring-primary-600 transition hover:bg-primary-50 active:scale-95 disabled:opacity-50"
              >
                🔑 パスキーでログイン
              </button>
              <p className="text-xs text-gray-400">
                パスキーは、ログイン後の「アカウント」画面で登録できます。
              </p>
            </>
          )}
        </div>
      ) : (
        <form
          onSubmit={handleRegister}
          className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5"
        >
          <div>
            <label htmlFor="reg-username" className="mb-1 block text-sm font-semibold">
              ID(3〜50文字、空白なし)
            </label>
            <input
              id="reg-username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="reg-password" className="mb-1 block text-sm font-semibold">
              パスワード(8文字以上)
            </label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label htmlFor="reg-password2" className="mb-1 block text-sm font-semibold">
              パスワード(確認)
            </label>
            <input
              id="reg-password2"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          {signup.codeRequired && (
            <div>
              <label htmlFor="reg-code" className="mb-1 block text-sm font-semibold">登録コード</label>
              <input
                id="reg-code"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass}
                required
              />
              <p className="mt-1 text-xs text-gray-400">管理者から教えてもらったコードを入力してください。</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className={primaryButton}>
            {loading ? '登録中...' : '登録してはじめる'}
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm">
        {mode === 'login' ? (
          signup.enabled && (
            <button onClick={() => switchMode('register')} className="text-primary-600 hover:underline">
              はじめての方は新規登録
            </button>
          )
        ) : (
          <button onClick={() => switchMode('login')} className="text-primary-600 hover:underline">
            ← ログインに戻る
          </button>
        )}
      </p>
    </main>
  );
}
