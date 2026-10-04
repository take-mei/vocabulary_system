import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyPassword, verifyAgainstDummy } from '@/lib/password';
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body as { username?: unknown; password?: unknown };

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ error: 'IDとパスワードを入力してください' }, { status: 400 });
  }

  const { data: user, error } = await supabaseAdmin
    .from('app_users')
    .select('username, password_hash')
    .eq('username', username.trim())
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'ログイン処理に失敗しました' }, { status: 500 });
  }

  let ok = false;
  if (user) {
    ok = await verifyPassword(password, user.password_hash);
  } else {
    await verifyAgainstDummy(password);
  }

  if (!ok || !user) {
    return NextResponse.json({ error: 'IDまたはパスワードが違います' }, { status: 401 });
  }

  let token: string;
  try {
    token = await createSessionToken(user.username);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '認証設定エラー' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
