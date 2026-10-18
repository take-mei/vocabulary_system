import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, unauthorized } from '@/lib/userData';

export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { ids, archived } = body as { ids?: string[]; archived?: boolean };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids は必須です' }, { status: 400 });
  }
  if (typeof archived !== 'boolean') {
    return NextResponse.json({ error: 'archived(true/false)は必須です' }, { status: 400 });
  }
  if (!ids.every(isUuid)) {
    return NextResponse.json({ error: 'ids が不正です' }, { status: 400 });
  }

  // 自分の単語だけを対象にする(他人の単語IDが混ざっていても無視される)
  const { data, error } = await supabaseAdmin
    .from('words')
    .update({ archived })
    .in('id', ids)
    .eq('user_id', userId)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, updated: data?.length ?? 0 });
}
