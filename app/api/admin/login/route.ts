import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_MAX_AGE, SESSION_COOKIE, createAdminToken, verifySessionToken } from '@/lib/auth';
import { verifyAdminPassword } from '@/lib/password';

export const runtime = 'nodejs';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { password } = body as { password?: unknown };
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'パスワードを入力してください' }, { status: 400 });
  }

  const result = await verifyAdminPassword(password);
  if (result === 'not-configured') {
    return NextResponse.json(
      { error: '管理者パスワードが未設定です(Vercelの環境変数 ADMIN_PASSWORD を確認してください)' },
      { status: 500 }
    );
  }
  if (result === 'error') {
    return NextResponse.json({ error: '認証処理に失敗しました。時間をおいて再度お試しください' }, { status: 500 });
  }
  if (result !== 'ok') {
    await sleep(800); // 総当たりを少しでも遅くする
    return NextResponse.json({ error: '管理者パスワードが違います' }, { status: 401 });
  }

  const token = await createAdminToken(session.userId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ADMIN_MAX_AGE,
  });
  return res;
}
