import Link from 'next/link';

export default function NavHeader() {
  return (
    <header className="mb-6 flex items-center justify-between">
      <Link href="/" className="text-lg font-bold text-primary-700">
        📚 単語帳アプリ
      </Link>
      <nav className="flex gap-3 text-sm text-primary-700">
        <Link href="/stats" className="hover:underline">
          統計
        </Link>
        <Link href="/admin" className="hover:underline">
          管理者
        </Link>
      </nav>
    </header>
  );
}
