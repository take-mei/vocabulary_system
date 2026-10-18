import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSession } from '@/lib/auth';
import { unauthorized } from '@/lib/userData';

// ログイン中のユーザー名とロール(user/admin)を返す。メニューの表示切り替えに使う。
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('username, role')
    .eq('id', session.userId)
    .maybeSingle();
  if (error || !data) return unauthorized();

  return NextResponse.json({
    data: { username: data.username, role: data.role === 'admin' ? 'admin' : 'user' },
  });
}
