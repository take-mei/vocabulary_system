import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: '不正なIDです' }, { status: 400 });
  }

  // 自分自身を削除すると、誰もログインできなくなる事故につながるため禁止する
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
