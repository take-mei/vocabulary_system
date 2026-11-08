import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, notFound, unauthorized } from '@/lib/userData';
import { ownedUniversity } from '@/lib/pastExams';
import { MAX_EXAM_CHARS } from '@/lib/types';

const PAGE_MAX = 200;

// GET /api/universities/[id]/exams?offset=0&limit=100
// 過去問の一覧(本文は含めない)。何件あっても、ページ分けして取れる。
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!(await ownedUniversity(userId, params.id))) return notFound('大学が見つかりません');

  const offset = Math.max(parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10) || 0, 0);
  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get('limit') ?? '100', 10) || 100, 1),
    PAGE_MAX
  );

  const { data, error, count } = await supabaseAdmin
    .from('past_exams')
    .select('id, university_id, title, char_count, created_at', { count: 'exact' })
    .eq('university_id', params.id)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}

// POST /api/universities/[id]/exams
//   { title?, content }  または  { exams: [{ title?, content }, ...] }
// 件数の上限はない。(1件あたりの文字数にだけ、通信の都合で上限がある)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!(await ownedUniversity(userId, params.id))) return notFound('大学が見つかりません');

  const body = await req.json().catch(() => ({}));
  const items: unknown[] = Array.isArray(body.exams) ? body.exams : [body];

  const rows: { user_id: string; university_id: string; title: string; content: string }[] = [];
  for (const item of items) {
    const it = (item ?? {}) as { title?: unknown; content?: unknown };
    const content = typeof it.content === 'string' ? it.content.trim() : '';
    if (!content) continue; // 空の過去問は無視する
    if (content.length > MAX_EXAM_CHARS) {
      return NextResponse.json(
        { error: `1件あたり${MAX_EXAM_CHARS.toLocaleString()}文字までです。分けて登録してください` },
        { status: 400 }
      );
    }
    const title = typeof it.title === 'string' ? it.title.trim().slice(0, 200) : '';
    rows.push({ user_id: userId, university_id: params.id, title, content });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: '過去問の本文を入力してください' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('past_exams')
    .insert(rows)
    .select('id, university_id, title, char_count, created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], added: rows.length });
}
