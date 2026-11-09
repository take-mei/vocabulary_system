import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, unauthorized } from '@/lib/userData';
import { generateExamSection } from '@/lib/gemini';
import { loadExcerpts } from '@/lib/pastExams';
import { normalizeAnalysis } from '@/lib/examAnalysis';

// 大問1つ分(Gemini 1回)。長文を大問ごとに分けて作るのは、1回の生成時間を短くして、Vercelの実行時間の上限に収めるため。
export const maxDuration = 60;

function strList(v: unknown, maxItems: number, maxLen: number): string[] {
  return (Array.isArray(v) ? v : [])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.slice(0, maxLen))
    .slice(0, maxItems);
}

// POST /api/generate-passage/section
//   { plan: ExamPlan(/plan の返したもの), index, avoid_topics? }
export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const plan = (body.plan ?? {}) as Record<string, any>;
  const index = Number(body.index);

  const rawSections: unknown[] = Array.isArray(plan.sections) ? plan.sections : [];
  if (!Number.isInteger(index) || index < 0 || index >= rawSections.length || rawSections.length > 30) {
    return NextResponse.json({ error: 'index が不正です' }, { status: 400 });
  }

  // 大問の仕様は、解析結果と同じ検証・整形を通す(長さや種類を制限する)
  const normalized = normalizeAnalysis({ sections: rawSections });
  const spec = normalized?.sections[index];
  if (!spec) return NextResponse.json({ error: '大問の仕様が不正です' }, { status: 400 });

  const wordIds: string[] = (Array.isArray((rawSections[index] as any)?.word_ids) ? (rawSections[index] as any).word_ids : []).filter(isUuid);
  const exampleIds: string[] = (Array.isArray(plan.reference_exam_ids) ? plan.reference_exam_ids : []).filter(isUuid);

  try {
    let words: { word: string; mean: string }[] = [];
    if (wordIds.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('words')
        .select('word, mean')
        .in('id', wordIds)
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      words = (data ?? []) as { word: string; mean: string }[];
    }

    const references = await loadExcerpts(userId, exampleIds);

    const section = await generateExamSection({
      spec,
      index,
      total: rawSections.length,
      universityNames: strList(plan.university_names, 10, 100),
      templateLabel: String(plan.template_label ?? '').slice(0, 200),
      questionLanguage: String(plan.question_language ?? '').slice(0, 40),
      styleNotes: strList(plan.style_notes, 8, 1800),
      references,
      words,
      avoidTopics: strList(body.avoid_topics, 30, 200),
    });

    return NextResponse.json({ data: section });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '大問の生成に失敗しました' },
      { status: e?.status === 429 ? 429 : 500 }
    );
  }
}
