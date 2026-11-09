import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, notFound, unauthorized } from '@/lib/userData';
import { analyzeExamText } from '@/lib/gemini';

// 本文が長いほど時間がかかるため、実行時間の上限を広げておく
export const maxDuration = 60;

const COLUMNS = 'id, university_id, title, year, char_count, created_at, analysis, analyzed_at';

// POST /api/exams/[id]/analyze
// Geminiで過去問から「大問の構成」「問題文の特性」を読み取って保存する(Gemini 1回)。
// 年が未入力で、本文から年度が読み取れた場合は、年も入れる。
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();
  if (!isUuid(params.id)) return notFound('過去問が見つかりません');

  try {
    const { data: exam, error } = await supabaseAdmin
      .from('past_exams')
      .select('id, year, content, universities(name)')
      .eq('id', params.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!exam) return notFound('過去問が見つかりません');

    const universityName = (exam as any).universities?.name ?? '大学';
    const analysis = await analyzeExamText(universityName, String(exam.content));

    const update: { analysis: unknown; analyzed_at: string; year?: number } = {
      analysis,
      analyzed_at: new Date().toISOString(),
    };
    if (exam.year === null && analysis.detected_year) update.year = analysis.detected_year;

    const { data, error: updateError } = await supabaseAdmin
      .from('past_exams')
      .update(update)
      .eq('id', params.id)
      .eq('user_id', userId)
      .select(COLUMNS)
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!data) return notFound('過去問が見つかりません');

    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '過去問の解析に失敗しました' },
      { status: e?.status === 429 ? 429 : 500 }
    );
  }
}
