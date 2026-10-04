import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, SESSION_COOKIE, verifyAdminToken, verifySessionToken } from '@/lib/auth';

// middleware(Edge Runtime)から使う。Node専用モジュールをimportしないこと。
//
// セッション(JWT)は署名が正しければ有効期限まで通ってしまうため、
// 管理画面でユーザーを削除しても、そのままだと最大30日ログインしたままになる。
// それを防ぐため、ユーザーがDBにまだ存在するかをSupabaseに問い合わせる。
// リクエストごとに問い合わせると遅いので、同じインスタンス内で短時間だけ結果をキャッシュする。
// => 削除から最大でおよそ TTL 秒後に、そのユーザーはログアウト状態になる。
const TTL_MS = 30_000;
const verifiedUntil = new Map<string, number>();

export async function userStillExists(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = verifiedUntil.get(userId);
  if (cached && cached > now) return true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true; // 設定不備はここでは判断しない(APIルート側でエラーになる)

  try {
    const res = await fetch(
      `${url}/rest/v1/app_users?select=id&id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }
    );
    if (!res.ok) return true; // Supabase側の一時的な不調でログイン済みの人を締め出さない
    const rows = (await res.json()) as unknown[];
    if (rows.length === 0) {
      verifiedUntil.delete(userId);
      return false;
    }
    if (verifiedUntil.size > 500) verifiedUntil.clear();
    verifiedUntil.set(userId, now + TTL_MS);
    return true;
  } catch {
    return true;
  }
}

// ログインページ・認証API・Service Workerは未ログインでもアクセスできる。
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/sw.js'];

// 管理者パスワードの入力画面/APIは「ログイン済み」であれば開ける(管理者認証はまだ不要)。
const ADMIN_AUTH_PATHS = ['/admin/login', '/api/admin/login', '/api/admin/logout'];

// 管理者認証が必要なAPI。管理者画面でしか使わない書き込み系・管理系のAPIを守る。
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
  if (ADMIN_AUTH_PATHS.includes(pathname)) return false;
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
      res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
    }
    return res;
  }

  // 1) 通常ログイン
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return toLogin(false);

  // 管理画面で削除されたユーザーのセッションは無効にする
  if (!(await userStillExists(session.userId))) return toLogin(true);

  // 2) 管理者パスワード
  if (needsAdmin(pathname)) {
    const isAdmin = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, session.userId);
    if (!isAdmin) {
      if (isApi) {
        return NextResponse.json({ error: '管理者認証が必要です' }, { status: 403 });
      }
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = '';
      if (pathname !== '/admin') url.searchParams.set('next', pathname + search);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
