import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { hashPassword } from '@/lib/password';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// パスワード変更 / 権限(role)変更。body: { password?: string, role?: 'user' | 'admin' }
// 管理者権限の確認はmiddlewareで済んでいる。
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: '不正なIDです' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { password, role } = body as { password?: unknown; role?: unknown };
  const update: { password_hash?: string; role?: 'user' | 'admin' } = {};

  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
      return NextResponse.json({ error: 'パスワードは8文字以上200文字以下にしてください' }, { status: 400 });
    }
    update.password_hash = await hashPassword(password);
  }

  if (role !== undefined) {
    if (role !== 'user' && role !== 'admin') {
      return NextResponse.json({ error: '権限の指定が不正です' }, { status: 400 });
    }
    // 自分の権限を外すと、管理者が誰もいなくなる事故につながるため禁止する
    const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
    if (session?.userId === params.id) {
      return NextResponse.json({ error: 'ログイン中のユーザー自身の権限は変更できません' }, { status: 400 });
    }
    update.role = role;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '変更する内容がありません' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .update(update)
    .eq('id', params.id)
    .select('id');

  if (error) {
    return NextResponse.json({ error: '変更に失敗しました' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: '不正なIDです' }, { status: 400 });
  }

  // 自分自身を削除すると、管理者が誰もいなくなる事故につながるため禁止する
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session?.userId === params.id) {
    return NextResponse.json({ error: 'ログイン中のユーザー自身は削除できません' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .delete()
    .eq('id', params.id)
    .select('id');

  if (error) {
    return NextResponse.json({ error: 'ユーザーの削除に失敗しました' }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
