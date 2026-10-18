import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, notFound, unauthorized } from '@/lib/userData';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('単語が見つかりません');

  const body = await req.json().catch(() => ({}));
  const { word, mean, remarks, importance, phonetic, archived } = body;

  const updatePayload: Record<string, unknown> = { word, mean, remarks };
  if (typeof importance === 'number' && importance >= 1 && importance <= 5) {
    updatePayload.importance = importance;
  }
  if (typeof phonetic === 'string' || phonetic === null) {
    updatePayload.phonetic = phonetic;
  }
  if (typeof archived === 'boolean') {
    updatePayload.archived = archived;
  }

  const { data, error } = await supabaseAdmin
    .from('words')
    .update(updatePayload)
    .eq('id', params.id)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return notFound('単語が見つかりません');
  return NextResponse.json({ data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('単語が見つかりません');

  const { data, error } = await supabaseAdmin
    .from('words')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return notFound('単語が見つかりません');
  return NextResponse.json({ ok: true });
}
