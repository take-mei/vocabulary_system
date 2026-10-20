import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, notFound, ownsSet, unauthorized } from '@/lib/userData';

export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const setId = req.nextUrl.searchParams.get('set_id');
  if (setId && !isUuid(setId)) {
    return NextResponse.json({ error: 'set_id が不正です' }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('words')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (setId) {
    query = query.eq('set_id', setId);
  }

  // ?checked=true なら、チェック(☆)した単語だけ
  if (req.nextUrl.searchParams.get('checked') === 'true') {
    query = query.eq('checked', true);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { set_id, word, mean, remarks, importance, phonetic } = body;

  if (!set_id || !word || !mean) {
    return NextResponse.json(
      { error: 'set_id, word, mean は必須です' },
      { status: 400 }
    );
  }
  if (!(await ownsSet(userId, set_id))) return notFound('単語帳が見つかりません');

  const importanceValue =
    typeof importance === 'number' && importance >= 1 && importance <= 5
      ? importance
      : 3;

  const { data, error } = await supabaseAdmin
    .from('words')
    .insert({
      user_id: userId,
      set_id,
      word,
      mean,
      remarks: remarks ?? null,
      phonetic: phonetic ?? null,
      importance: importanceValue,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
