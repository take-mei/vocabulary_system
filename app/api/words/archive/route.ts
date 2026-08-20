import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { ids, archived } = body as { ids?: string[]; archived?: boolean };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids は必須です' }, { status: 400 });
  }
  if (typeof archived !== 'boolean') {
    return NextResponse.json({ error: 'archived(true/false)は必須です' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('words')
    .update({ archived })
    .in('id', ids)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, updated: data?.length ?? 0 });
}
