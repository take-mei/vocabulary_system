import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getPhoneticFromDictionaryApi } from '@/lib/dictionary';

// Gemini難易度判定APIと同じ理由で、一括処理はサーバー側では行わず
// 単語1件のみを処理する(呼び出し側が繰り返し呼び出してタイムアウトを回避する)。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { word_id } = body as { word_id?: string };

  if (!word_id) {
    return NextResponse.json({ error: 'word_id が必要です' }, { status: 400 });
  }

  try {
    const { data: word, error } = await supabaseAdmin
      .from('words')
      .select('*')
      .eq('id', word_id)
      .single();

    if (error || !word) {
      throw new Error(error?.message ?? '単語が見つかりません');
    }

    const phonetic = await getPhoneticFromDictionaryApi(word.word);

    if (!phonetic) {
      return NextResponse.json(
        { error: `「${word.word}」の発音記号が見つかりませんでした` },
        { status: 404 }
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('words')
      .update({ phonetic })
      .eq('id', word_id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ data: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '発音記号の取得に失敗しました' },
      { status: 500 }
    );
  }
}
