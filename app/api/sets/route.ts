import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('word_sets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, type, description } = body;

  if (!name || !type || !['english', 'kobun'].includes(type)) {
    return NextResponse.json(
      { error: 'name と type(english|kobun) は必須です' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('word_sets')
    .insert({ name, type, description: description ?? null })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
