import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, notFound, ownsSet, unauthorized } from '@/lib/userData';

interface ImportRow {
  word: string;
  mean: string;
  remarks?: string;
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { set_id, rows } = body as { set_id: string; rows: ImportRow[] };

  if (!set_id) {
    return NextResponse.json({ error: 'set_id は必須です' }, { status: 400 });
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: 'インポートする行がありません' },
      { status: 400 }
    );
  }
  if (!(await ownsSet(userId, set_id))) return notFound('単語帳が見つかりません');

  const validRows = rows
    .filter((r) => r.word && r.mean)
    .map((r) => ({
      user_id: userId,
      set_id,
      word: String(r.word).trim(),
      mean: String(r.mean).trim(),
      remarks: r.remarks ? String(r.remarks).trim() : null,
    }));

  if (validRows.length === 0) {
    return NextResponse.json(
      { error: '有効な行がありません(word, mean は必須です)' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('words')
    .insert(validRows)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    imported: data?.length ?? 0,
    skipped: rows.length - validRows.length,
  });
}
