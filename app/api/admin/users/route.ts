import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword } from '@/lib/password';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

// 認証はmiddlewareで済んでいる(管理者認証必須)。password_hashは絶対に返さない。

export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('id, username, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'ユーザー一覧の取得に失敗しました' }, { status: 500 });
  }
  return NextResponse.json({
    data: (data ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      created_at: u.created_at,
      is_current: u.id === session?.userId,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body as { username?: unknown; password?: unknown };

  if (typeof username !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'IDとパスワードは必須です' }, { status: 400 });
  }
  const name = username.trim();
  if (!/^\S{3,50}$/.test(name)) {
    return NextResponse.json(
      { error: 'IDは3〜50文字で、空白を含めないでください' },
      { status: 400 }
    );
  }
  if (password.length < 8 || password.length > 200) {
    return NextResponse.json({ error: 'パスワードは8文字以上200文字以下にしてください' }, { status: 400 });
  }

  const password_hash = await hashPassword(password);
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .insert({ username: name, password_hash })
    .select('id, username, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'そのIDは既に使われています' }, { status: 409 });
    }
    return NextResponse.json({ error: 'ユーザーの追加に失敗しました' }, { status: 500 });
  }
  // select()で絞っているが、念のためハッシュが絶対に混ざらないよう返す項目を明示する
  return NextResponse.json({
    data: { id: data.id, username: data.username, created_at: data.created_at },
  });
}
