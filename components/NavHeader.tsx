'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SyncStatus from '@/components/SyncStatus';
import { clearOfflineData, flushPendingActions } from '@/lib/offlineStore';

interface Me {
  username: string;
  role: 'user' | 'admin';
}

export default function NavHeader() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.data) setMe(json.data as Me);
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    // 未送信の学習記録があれば、先に送ってから端末のデータを消す(共用端末で他の人に見えないように)
    await flushPendingActions().catch(() => {});
    clearOfflineData();
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <>
      <header className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-primary-700">
          📚 単語帳アプリ
        </Link>
        <nav className="flex items-center gap-3 text-sm text-primary-700">
          <Link href="/stats" className="hover:underline">統計</Link>
          <Link href="/settings" className="hover:underline">設定</Link>
          {me?.role === 'admin' && (
            <Link href="/admin" className="hover:underline">管理者</Link>
          )}
          <button onClick={handleLogout} className="hover:underline">
            ログアウト{me ? `(${me.username})` : ''}
          </button>
        </nav>
      </header>
      <SyncStatus />
    </>
  );
}
