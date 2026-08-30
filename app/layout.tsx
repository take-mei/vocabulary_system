import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata: Metadata = {
  title: '単語帳アプリ',
  description: '英単語・古文単語を学習するための単語帳アプリ',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <ServiceWorkerRegister />
        <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
      </body>
    </html>
  );
}
