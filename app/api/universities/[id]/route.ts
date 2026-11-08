import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, notFound, unauthorized } from '@/lib/userData';

// PUT /api/universities/[id]  { name } … 大学名の変更
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('大学が見つかりません');

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) {
    return NextResponse.json({ error: '大学名は1〜100文字で入力してください' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('universities')
    .update({ name })
    .eq('id', params.id)
    .eq('user_id', userId)
    .select('id, name, created_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'その大学はすでに登録されています' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return notFound('大学が見つかりません');
  return NextResponse.json({ data });
}

// DELETE /api/universities/[id] … 大学と、その過去問をすべて削除
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('大学が見つかりません');

  const { data, error } = await supabaseAdmin
    .from('universities')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return notFound('大学が見つかりません');
  return NextResponse.json({ ok: true });
}
