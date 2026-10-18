import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, notFound, unauthorized } from '@/lib/userData';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('単語帳が見つかりません');

  const body = await req.json().catch(() => ({}));
  const { name, type, description } = body;
  if (type !== undefined && !['english', 'kobun'].includes(type)) {
    return NextResponse.json({ error: 'type は english か kobun です' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('word_sets')
    .update({ name, type, description })
    .eq('id', params.id)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return notFound('単語帳が見つかりません');
  return NextResponse.json({ data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('単語帳が見つかりません');

  const { data, error } = await supabaseAdmin
    .from('word_sets')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) return notFound('単語帳が見つかりません');
  return NextResponse.json({ ok: true });
}
