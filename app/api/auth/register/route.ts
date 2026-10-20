import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword } from '@/lib/password';
import { createSessionToken, setSessionCookie } from '@/lib/auth';
import { getSignupSettings } from '@/lib/signup';

export const runtime = 'nodejs';

function sha256(s: string) {
  return createHash('sha256').update(s).digest();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 新規登録。管理者が受付を開始している間だけ使える(誰でも作れる状態にはしない)。
// 作られるのは必ず一般ユーザー(role=user)。成功したら、そのままログイン状態になる。
export async function POST(req: NextRequest) {
  const settings = await getSignupSettings();
  if (!settings.enabled) {
    return NextResponse.json({ error: '新規登録は現在受け付けていません' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { username, password, code } = body as { username?: unknown; password?: unknown; code?: unknown };

  // 登録コードが設定されている場合は、一致しないと登録できない
  if (settings.code !== '') {
    const provided = typeof code === 'string' ? code : '';
    if (!timingSafeEqual(sha256(provided), sha256(settings.code))) {
      await sleep(800); // 総当たりを少しでも遅くする
      return NextResponse.json({ error: '登録コードが違います' }, { status: 403 });
    }
  }

  if (typeof username !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'IDとパスワードは必須です' }, { status: 400 });
  }
  const name = username.trim();
  if (!/^\S{3,50}$/.test(name)) {
    return NextResponse.json({ error: 'IDは3〜50文字で、空白を含めないでください' }, { status: 400 });
  }
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json({ error: 'パスワードは8文字以上200文字以下にしてください' }, { status: 400 });
  }

  const password_hash = await hashPassword(password);
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .insert({ username: name, password_hash, role: 'user' })
    .select('id, username')
    .single();

  if (error || !data) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'そのIDは既に使われています' }, { status: 409 });
    }
    return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 });
  }

  const token = await createSessionToken({ userId: data.id, username: data.username });
  const res = NextResponse.json({ ok: true, username: data.username });
  setSessionCookie(res, token);
  return res;
}
