import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

// ---------------------------------------------------------------
// ユーザーの存在とロール(user/admin)をDBで確認する。
//  - 削除されたユーザーは、セッション(JWT)が有効でもログアウト扱いにする
//  - 管理者かどうかは毎回DBの app_users.role で判断する(JWTには入れない)
// リクエストごとに問い合わせると遅いので、同じインスタンス内で30秒だけ結果をキャッシュする。
// => 削除/権限変更は、最大でおよそ30秒後に反映される。
// ---------------------------------------------------------------
type Role = 'user' | 'admin';
type UserCheck = { status: 'ok'; role: Role } | { status: 'gone' } | { status: 'unknown' };

const TTL_MS = 30_000;
const cache = new Map<string, { role: Role; until: number }>();

async function checkUser(userId: string): Promise<UserCheck> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.until > now) return { status: 'ok', role: cached.role };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { status: 'unknown' };

  try {
    const res = await fetch(
      `${url}/rest/v1/app_users?select=role&id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }
    );
    // Supabase側の一時的な不調やrole列が未作成の場合は「不明」。
    // 一般の画面は通すが、管理者向けの画面/APIは通さない。
    if (!res.ok) return { status: 'unknown' };
    const rows = (await res.json()) as { role?: string }[];
    if (rows.length === 0) {
      cache.delete(userId);
      return { status: 'gone' };
    }
    const role: Role = rows[0].role === 'admin' ? 'admin' : 'user';
    if (cache.size > 500) cache.clear();
    cache.set(userId, { role, until: now + TTL_MS });
    return { status: 'ok', role };
  } catch {
    return { status: 'unknown' };
  }
}

// ログインページ・認証API・Service Workerは未ログインでもアクセスできる。
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/sw.js'];

// 管理者(role=admin)だけが使えるページ/API。管理者画面でしか使わない書き込み系・管理系のAPIを守る。
// (/api/words/archive は出題画面からも使うので対象外)
const ADMIN_API_PREFIXES = [
  '/api/admin',
  '/api/sets',
  '/api/words',
  '/api/import',
  '/api/difficulty',
  '/api/phonetic',
];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

function needsAdmin(pathname: string): boolean {
  if (matches(pathname, '/admin')) return true;
  if (pathname === '/api/words/archive') return false;
  return ADMIN_API_PREFIXES.some((p) => matches(pathname, p));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  if (!process.env.AUTH_SECRET) {
    // 設定漏れの場合は「認証なしで公開」ではなくエラーにする(fail closed)
    return new NextResponse('AUTH_SECRET が設定されていません。', { status: 500 });
  }

  const isApi = pathname.startsWith('/api/');

  function toLogin(clearSession: boolean) {
    let res: NextResponse;
    if (isApi) {
      res = NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    } else {
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      if (pathname !== '/') url.searchParams.set('next', pathname + search);
      res = NextResponse.redirect(url);
    }
    if (clearSession) {
      res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 });
    }
    return res;
  }

  // 1) ログイン済みか
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return toLogin(false);

  // 2) ユーザーがまだ存在するか / ロールは何か
  const check = await checkUser(session.userId);
  if (check.status === 'gone') return toLogin(true);

  // 3) 管理者向けのページ/APIは role=admin のみ
  if (needsAdmin(pathname)) {
    if (check.status !== 'ok' || check.role !== 'admin') {
      if (isApi) {
        return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
