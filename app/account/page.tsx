'use client';

import { FormEvent, useEffect, useState } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import NavHeader from '@/components/NavHeader';

interface Passkey {
  id: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string | null;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString('ja-JP') : '未使用';
}

export default function AccountPage() {
  const [username, setUsername] = useState<string>('');

  // パスキー
  const [supported, setSupported] = useState(true);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [keyName, setKeyName] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);

  // パスワード変更
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmNext, setConfirmNext] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwMessage, setPwMessage] = useState<string | null>(null);

  async function loadPasskeys() {
    try {
      const res = await fetch('/api/passkey');
      const json = await res.json().catch(() => ({}));
      if (res.ok) setPasskeys(json.data as Passkey[]);
      else setKeyError(json.error ?? 'パスキーの一覧を取得できませんでした');
    } catch {
      setKeyError('通信に失敗しました');
    }
    setLoadingKeys(false);
  }

  useEffect(() => {
    setSupported(browserSupportsWebAuthn());
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => json?.data && setUsername(json.data.username))
      .catch(() => {});
    loadPasskeys();
  }, []);

  async function handleAddPasskey() {
    setKeyBusy(true);
    setKeyError(null);
    setKeyMessage(null);
    try {
      const optRes = await fetch('/api/passkey/register/options', { method: 'POST' });
      const options = await optRes.json().catch(() => ({}));
      if (!optRes.ok) throw new Error(options.error ?? 'options');

      // 端末が、パスキーの作成と本人確認(指紋・顔・PINなど)を求める
      const attestation = await startRegistration({ optionsJSON: options });

      const verRes = await fetch('/api/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: attestation, name: keyName }),
      });
      const json = await verRes.json().catch(() => ({}));
      if (!verRes.ok) {
        setKeyError(json.error ?? 'パスキーを登録できませんでした');
      } else {
        setKeyMessage('パスキーを登録しました。次回から「パスキーでログイン」が使えます');
        setKeyName('');
        await loadPasskeys();
      }
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') setKeyError('パスキーの作成がキャンセルされました');
      else if (err?.name === 'InvalidStateError') setKeyError('この端末のパスキーは、すでに登録されています');
      else setKeyError('パスキーを登録できませんでした');
    }
    setKeyBusy(false);
  }

  async function handleDeletePasskey(key: Passkey) {
    if (!confirm(`パスキー「${key.device_name ?? ''}」を削除しますか?\n(この端末では、パスキーでのログインができなくなります)`)) return;
    setKeyError(null);
    setKeyMessage(null);
    try {
      const res = await fetch(`/api/passkey/${key.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setKeyError(json.error ?? 'パスキーを削除できませんでした');
      else {
        setKeyMessage('パスキーを削除しました');
        await loadPasskeys();
      }
    } catch {
      setKeyError('通信に失敗しました');
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwMessage(null);
    if (next !== confirmNext) {
      setPwError('新しいパスワードが一致しません');
      return;
    }
    setPwBusy(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setPwError(json.error ?? 'パスワードを変更できませんでした');
      else {
        setPwMessage('パスワードを変更しました');
        setCurrent('');
        setNext('');
        setConfirmNext('');
      }
    } catch {
      setPwError('通信に失敗しました');
    }
    setPwBusy(false);
  }

  const inputClass = 'rounded-lg border border-gray-300 px-3 py-2 text-sm';

  return (
    <main>
      <NavHeader />
      <h1 className="mb-1 text-xl font-bold">アカウント</h1>
      {username && <p className="mb-4 text-sm text-gray-500">ログイン中: {username}</p>}

      {/* パスキー */}
      <section className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-1 font-bold">🔑 パスキー</h2>
        <p className="mb-3 text-xs text-gray-500">
          指紋・顔認証・PINなどで、パスワードなしでログインできるようになります。
          パスワードでのログインも、そのまま使えます。パスキーはこのサイト専用で、端末ごとに登録します。
        </p>

        {!supported && (
          <p className="mb-3 text-sm text-amber-700">このブラウザは、パスキーに対応していません。</p>
        )}

        {supported && (
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="名前(例: 自分のスマホ)任意"
              maxLength={50}
              className={`${inputClass} flex-1`}
            />
            <button
              onClick={handleAddPasskey}
              disabled={keyBusy}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {keyBusy ? '登録中...' : 'この端末のパスキーを追加'}
            </button>
          </div>
        )}

        {keyError && <p className="mb-2 text-sm text-red-600">{keyError}</p>}
        {keyMessage && <p className="mb-2 text-sm text-green-700">{keyMessage}</p>}

        {loadingKeys ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-gray-400">登録済みのパスキーはありません。</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {passkeys.map((k) => (
              <li key={k.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-semibold">{k.device_name ?? 'パスキー'}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    登録 {formatDate(k.created_at)} / 最終使用 {formatDate(k.last_used_at)}
                  </span>
                </div>
                <button onClick={() => handleDeletePasskey(k)} className="text-xs text-red-500 hover:underline">
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* パスワード変更 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
        <h2 className="mb-1 font-bold">パスワードの変更</h2>
        <p className="mb-3 text-xs text-gray-500">8文字以上で、自由に変更できます。</p>
        <form onSubmit={handleChangePassword} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="現在のパスワード"
            autoComplete="current-password"
            className={`${inputClass} sm:col-span-2`}
            required
          />
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="新しいパスワード(8文字以上)"
            autoComplete="new-password"
            className={inputClass}
            required
          />
          <input
            type="password"
            value={confirmNext}
            onChange={(e) => setConfirmNext(e.target.value)}
            placeholder="新しいパスワード(確認)"
            autoComplete="new-password"
            className={inputClass}
            required
          />
          <button
            type="submit"
            disabled={pwBusy}
            className="rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
          >
            {pwBusy ? '変更中...' : 'パスワードを変更'}
          </button>
        </form>
        {pwError && <p className="mt-2 text-sm text-red-600">{pwError}</p>}
        {pwMessage && <p className="mt-2 text-sm text-green-700">{pwMessage}</p>}
      </section>
    </main>
  );
}
