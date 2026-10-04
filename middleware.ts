import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// ログインページ・認証API・Service Workerを除く全ページ/APIをログイン必須にする。
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/sw.js'];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  if (!process.env.AUTH_SECRET) {
    // 設定漏れの場合は「認証なしで公開」ではなくエラーにする(fail closed)
    return new NextResponse('AUTH_SECRET が設定されていません。', { status: 500 });
  }

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  if (pathname !== '/') url.searchParams.set('next', pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
