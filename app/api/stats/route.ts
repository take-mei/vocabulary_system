import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, unauthorized } from '@/lib/userData';

// ログイン中ユーザー自身の学習ログと単語帳を返す。
// Supabaseは1回の取得が最大1000行なので、ページを分けて全件取得する。
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const logs: unknown[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabaseAdmin
      .from('study_logs')
      .select('*')
      .eq('user_id', userId)
      .order('answered_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logs.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const { data: sets, error: setError } = await supabaseAdmin
    .from('word_sets')
    .select('*')
    .eq('user_id', userId);
  if (setError) return NextResponse.json({ error: setError.message }, { status: 500 });

  return NextResponse.json({ logs, sets: sets ?? [] });
}
