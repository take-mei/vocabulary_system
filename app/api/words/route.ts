import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: NextRequest) {
  const setId = req.nextUrl.searchParams.get('set_id');
  let query = supabaseAdmin
    .from('words')
    .select('*')
    .order('created_at', { ascending: false });

  if (setId) {
    query = query.eq('set_id', setId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { set_id, word, mean, remarks } = body;

  if (!set_id || !word || !mean) {
    return NextResponse.json(
      { error: 'set_id, word, mean は必須です' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('words')
    .insert({ set_id, word, mean, remarks: remarks ?? null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
