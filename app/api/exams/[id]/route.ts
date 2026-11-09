import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, notFound, unauthorized } from '@/lib/userData';
import { MAX_EXAM_CHARS } from '@/lib/types';
import { parseYear } from '@/lib/examYear';

const COLUMNS = 'id, university_id, title, year, char_count, created_at, analysis, analyzed_at';

// GET /api/exams/[id] … 本文つきで1件
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('過去問が見つかりません');

  const { data, error } = await supabaseAdmin
    .from('past_exams')
    .select(`${COLUMNS}, content`)
    .eq('id', params.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return notFound('過去問が見つかりません');
  return NextResponse.json({ data });
}

// PUT /api/exams/[id]  { title?, content? } … 編集
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('過去問が見つかりません');

  const body = await req.json().catch(() => ({}));
  const update: {
    title?: string;
    content?: string;
    year?: number | null;
    analysis?: null;
    analyzed_at?: null;
  } = {};

  if (body.title !== undefined) {
    update.title = typeof body.title === 'string' ? body.title.trim().slice(0, 200) : '';
  }
  if (body.content !== undefined) {
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) return NextResponse.json({ error: '本文は空にできません' }, { status: 400 });
    if (content.length > MAX_EXAM_CHARS) {
      return NextResponse.json(
        { error: `1件あたり${MAX_EXAM_CHARS.toLocaleString()}文字までです` },
        { status: 400 }
      );
    }
    update.content = content;
    // 本文を変えたら、前の解析結果は古くなるので消す(解析し直す)
    update.analysis = null;
    update.analyzed_at = null;
  }
  if (body.year !== undefined) {
    const year = parseYear(body.year);
    if (year === undefined) {
      return NextResponse.json({ error: '年は1900〜2100の整数(西暦)で入力してください' }, { status: 400 });
    }
    update.year = year;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '変更する内容がありません' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('past_exams')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', userId)
    .select(COLUMNS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return notFound('過去問が見つかりません');
  return NextResponse.json({ data });
}

// DELETE /api/exams/[id]
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('過去問が見つかりません');

  const { data, error } = await supabaseAdmin
    .from('past_exams')
    .delete()
    .eq('id', params.id)
    .eq('user_id', userId)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return notFound('過去問が見つかりません');
  return NextResponse.json({ ok: true });
}
