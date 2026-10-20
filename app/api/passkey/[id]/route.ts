import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSession } from '@/lib/auth';
import { isUuid } from '@/lib/userData';

export const runtime = 'nodejs';

// 自分のパスキーを削除する(他人のパスキーは削除できない)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: 'パスキーが見つかりません' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('app_passkeys')
    .delete()
    .eq('id', params.id)
    .eq('user_id', session.userId)
    .select('id');

  if (error) return NextResponse.json({ error: 'パスキーを削除できませんでした' }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'パスキーが見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
