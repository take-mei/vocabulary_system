import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getDifficultyFromGemini } from '@/lib/gemini';
import { WordSetType } from '@/lib/types';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { word_id, set_id } = body as { word_id?: string; set_id?: string };

  if (!word_id && !set_id) {
    return NextResponse.json(
      { error: 'word_id または set_id が必要です' },
      { status: 400 }
    );
  }

  try {
    // 単語1件だけ判定
    if (word_id) {
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
    }

    // 単語帳まるごと一括判定
    const { data: set, error: setError } = await supabaseAdmin
      .from('word_sets')
      .select('*')
      .eq('id', set_id)
      .single();

    if (setError || !set) {
      throw new Error(setError?.message ?? '単語帳が見つかりません');
    }

    const { data: words, error: wordsError } = await supabaseAdmin
      .from('words')
      .select('*')
      .eq('set_id', set_id);

    if (wordsError || !words) {
      throw new Error(wordsError?.message ?? '単語の取得に失敗しました');
    }

    let updated = 0;
    let failed = 0;
    let firstError: string | null = null;

    // Gemini APIのレート制限を考慮し、順番に(並列にせず)処理する
    for (const w of words) {
      try {
        const difficulty = await getDifficultyFromGemini({
          word: w.word,
          mean: w.mean,
          type: set.type,
        });
        const { error: updateError } = await supabaseAdmin
          .from('words')
          .update({ difficulty })
          .eq('id', w.id);
        if (updateError) throw updateError;
        updated += 1;
      } catch (e: any) {
        failed += 1;
        const msg = e?.message ?? String(e);
        if (!firstError) firstError = msg;
        console.error(`難易度判定失敗 (word_id=${w.id}, word=${w.word}):`, msg);
      }
    }

    return NextResponse.json({
      updated,
      failed,
      total: words.length,
      firstError, // 失敗時の原因調査用(失敗が0件ならnull)
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '難易度判定に失敗しました' },
      { status: 500 }
    );
  }
}
