'use client';

import Link from 'next/link';
import NavHeader from '@/components/NavHeader';
import AdminUsers from '@/components/AdminUsers';

// 管理者画面はユーザー管理のみ。単語帳・単語の管理は各ユーザーの「設定」(/settings)で行う。
export default function AdminPage() {
  return (
    <main>
      <NavHeader />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">管理者画面</h1>
        <Link href="/" className="text-xs text-gray-500 hover:underline">
          ホームへ戻る
        </Link>
      </div>
      <AdminUsers />
    </main>
  );
}
