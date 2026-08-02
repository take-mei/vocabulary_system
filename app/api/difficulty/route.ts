import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getDifficultyFromGemini, peekRateLimitWaitMs } from '@/lib/gemini';
import { WordSetType } from '@/lib/types';

// Vercelのタイムアウトに引っかからないよう、1回のリクエストで処理する時間に上限を設ける。
// (Hobbyプランの既定10秒でも安全に収まる値。プランに応じてDIFFICULTY_BATCH_BUDGET_MSで調整可)
const BATCH_TIME_BUDGET_MS = Number(process.env.DIFFICULTY_BATCH_BUDGET_MS) || 8000;

// Next.js App Routerのルートセグメント設定。プラン側が対応していれば上限を引き上げる(無害な指定)。
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { word_id, set_id, force } = body as {
    word_id?: string;
    set_id?: string;
    force?: boolean; // trueなら既に判定済みの単語も含めて全件やり直す
  };

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

    // 単語帳まるごと一括判定(1回の呼び出しでは時間内に収まる分だけ処理し、
    // 残りは呼び出し側が同じリクエストを繰り返すことで自動的に続きから処理される)
    const { data: set, error: setError } = await supabaseAdmin
      .from('word_sets')
      .select('*')
      .eq('id', set_id)
      .single();

    if (setError || !set) {
      throw new Error(setError?.message ?? '単語帳が見つかりません');
    }

    const { count: total } = await supabaseAdmin
      .from('words')
      .select('*', { count: 'exact', head: true })
      .eq('set_id', set_id);

    let wordsQuery = supabaseAdmin.from('words').select('*').eq('set_id', set_id);
    if (!force) {
      wordsQuery = wordsQuery.is('difficulty', null);
    }
    const { data: words, error: wordsError } = await wordsQuery;

    if (wordsError || !words) {
      throw new Error(wordsError?.message ?? '単語の取得に失敗しました');
    }

    let updated = 0;
    let failed = 0;
    let firstError: string | null = null;
    let processed = 0;
    const batchStart = Date.now();

    // Gemini APIのレート制限を考慮し、順番に(並列にせず)処理する。
    // 残り時間がリクエスト1件分の待ち時間より短くなったら、無理せずここで打ち切って
    // 残りは次回の呼び出し(バッチ)に回す。
    for (const w of words) {
      const elapsed = Date.now() - batchStart;
      const estimatedWait = peekRateLimitWaitMs();
      if (elapsed + estimatedWait > BATCH_TIME_BUDGET_MS) break;

      processed += 1;
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

    const remaining = words.length - processed;

    return NextResponse.json({
      updated,
      failed,
      total: total ?? words.length,
      remaining, // このバッチ終了後、まだ未判定として残っている件数
      done: remaining === 0,
      firstError, // 失敗時の原因調査用(失敗が0件ならnull)
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '難易度判定に失敗しました' },
      { status: 500 }
    );
  }
}
