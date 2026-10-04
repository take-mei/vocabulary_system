import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { ADMIN_COOKIE, ADMIN_MAX_AGE, SESSION_COOKIE, createAdminToken, verifySessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

function sha256(s: string) {
  return createHash('sha256').update(s).digest();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD が設定されていません(サーバーの環境変数を確認してください)' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { password } = body as { password?: unknown };
  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'パスワードを入力してください' }, { status: 400 });
  }

  // 長さが違っても比較時間が変わらないよう、ハッシュ同士を定数時間で比較する
  const ok = timingSafeEqual(sha256(password), sha256(adminPassword));
  if (!ok) {
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
