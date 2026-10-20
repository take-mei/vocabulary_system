import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, unauthorized } from '@/lib/userData';

// 単語のチェック(☆)をまとめて付ける/外す。 body: { ids: string[], checked: boolean }
export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { ids, checked } = body as { ids?: string[]; checked?: boolean };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids は必須です' }, { status: 400 });
  }
  if (typeof checked !== 'boolean') {
    return NextResponse.json({ error: 'checked(true/false)は必須です' }, { status: 400 });
  }
  if (!ids.every(isUuid)) {
    return NextResponse.json({ error: 'ids が不正です' }, { status: 400 });
  }

  // 自分の単語だけを対象にする。IDが多いとURLが長くなるので100件ずつ処理する
  let updated = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabaseAdmin
      .from('words')
      .update({ checked })
      .in('id', ids.slice(i, i + 100))
      .eq('user_id', userId)
      .select('id');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    updated += data?.length ?? 0;
  }

  return NextResponse.json({ updated });
}
