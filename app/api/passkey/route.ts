import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';

// ログイン中のユーザー自身のパスキー一覧(公開鍵などは返さない)
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('app_passkeys')
    .select('id, device_name, created_at, last_used_at')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'パスキーの一覧を取得できませんでした' }, { status: 500 });
  }
  // 公開鍵や識別子が絶対に混ざらないよう、返す項目を明示する
  return NextResponse.json({
    data: (data ?? []).map((k: { id: string; device_name: string | null; created_at: string; last_used_at: string | null }) => ({
      id: k.id,
      device_name: k.device_name,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
    })),
  });
}
