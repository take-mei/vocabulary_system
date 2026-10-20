import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword, verifyPassword } from '@/lib/password';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ログイン中のユーザー自身が、自分のパスワードを変更する
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body as { currentPassword?: unknown; newPassword?: unknown };

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json({ error: '現在のパスワードと新しいパスワードを入力してください' }, { status: 400 });
  }
  if (newPassword.length < 8 || newPassword.length > 200) {
    return NextResponse.json({ error: '新しいパスワードは8文字以上200文字以下にしてください' }, { status: 400 });
  }

  const { data: user, error } = await supabaseAdmin
    .from('app_users')
    .select('password_hash')
    .eq('id', session.userId)
    .maybeSingle();
  if (error || !user) {
    return NextResponse.json({ error: '処理に失敗しました' }, { status: 500 });
  }

  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    await sleep(800);
    return NextResponse.json({ error: '現在のパスワードが違います' }, { status: 401 });
  }

  const password_hash = await hashPassword(newPassword);
  const { error: updateError } = await supabaseAdmin
    .from('app_users')
    .update({ password_hash })
    .eq('id', session.userId);
  if (updateError) {
    return NextResponse.json({ error: 'パスワードを変更できませんでした' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
