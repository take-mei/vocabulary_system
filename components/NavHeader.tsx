'use client';

import Link from 'next/link';
import SyncStatus from '@/components/SyncStatus';

export default function NavHeader() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <>
      <header className="mb-3 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-primary-700">
          📚 単語帳アプリ
        </Link>
        <nav className="flex gap-3 text-sm text-primary-700">
          <Link href="/stats" className="hover:underline">統計</Link>
          <Link href="/admin" className="hover:underline">管理者</Link>
          <button onClick={handleLogout} className="hover:underline">ログアウト</button>
        </nav>
      </header>
      <SyncStatus />
    </>
  );
}
