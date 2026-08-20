import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
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
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await supabaseAdmin.from('words').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
