import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, unauthorized } from '@/lib/userData';

const MAX_NAME = 100;

// GET /api/universities … 大学の一覧(登録済みの過去問の件数つき)
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('universities')
    .select('id, name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = data ?? [];
  const counts = await Promise.all(
    list.map(async (u: { id: string }) => {
      const { count } = await supabaseAdmin
        .from('past_exams')
        .select('id', { count: 'exact', head: true })
        .eq('university_id', u.id)
        .eq('user_id', userId);
      return count ?? 0;
    })
  );

  return NextResponse.json({
    data: list.map((u: any, i: number) => ({ ...u, exam_count: counts[i] })),
  });
}

// POST /api/universities  { name }
export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: '大学名を入力してください' }, { status: 400 });
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `大学名は${MAX_NAME}文字以内にしてください` }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('universities')
    .insert({ user_id: userId, name })
    .select('id, name, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'その大学はすでに登録されています' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: { ...data, exam_count: 0 } });
}
