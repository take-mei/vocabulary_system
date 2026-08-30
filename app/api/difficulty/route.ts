import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getDifficultyFromGemini } from '@/lib/gemini';
import { WordSetType } from '@/lib/types';

// 注意: 以前はset_idを渡すとサーバー側で全単語をループ判定していたが、
// 単語数が多いとVercelのサーバーレス関数タイムアウト(約10〜60秒)を超えて
// 途中で失敗してしまう(例: 175件中5件で停止)問題があった。
// そのため一括判定は廃止し、呼び出し側(管理画面)が単語ごとに
// このAPIを繰り返し呼び出す方式に変更した。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { word_id } = body as { word_id?: string };

  if (!word_id) {
    return NextResponse.json({ error: 'word_id が必要です' }, { status: 400 });
  }

  try {
    const { data: word, error } = await supabaseAdmin
      .from('words')
      .select('*, word_sets(type)')
      .eq('id', word_id)
      .single();

    if (error || !word) {
      throw new Error(error?.message ?? '単語が見つかりません');
    }

    const type = (word as any).word_sets?.type as WordSetType;
    const difficulty = await getDifficultyFromGemini({
      word: word.word,
      mean: word.mean,
      type,
    });

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('words')
      .update({ difficulty })
      .eq('id', word_id)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);
    return NextResponse.json({ data: updated });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '難易度判定に失敗しました' },
      { status: e?.status === 429 ? 429 : 500 }
    );
  }
}
