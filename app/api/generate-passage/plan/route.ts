import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, notFound, unauthorized } from '@/lib/userData';
import { listExamMetas, ownedUniversities } from '@/lib/pastExams';
import { buildPlan } from '@/lib/examPlan';

// POST /api/generate-passage/plan  { word_ids, university_ids }
// Geminiは呼ばない。選んだ大学の解析済みの過去問から、新しい年ほど選ばれやすいように重み付けして
// 「手本にする過去問」を選び、その大問構成を、大問ごとの設計図として返す。
//   mode: 'multi'  … 設計図(plan)を返す。クライアントが大問ごとに /section を呼ぶ
//   mode: 'single' … 解析済みの過去問が無い。従来どおり、1題だけ作る方式に切り替える(過去問の傾向だけ参考にする)
export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { word_ids, university_ids } = body as { word_ids?: string[]; university_ids?: string[] };

  if (!Array.isArray(word_ids) || word_ids.length === 0 || !word_ids.every(isUuid)) {
    return NextResponse.json({ error: 'word_ids が不正です' }, { status: 400 });
  }
  if (!Array.isArray(university_ids) || university_ids.length === 0 || !university_ids.every(isUuid)) {
    return NextResponse.json({ error: 'university_ids が不正です' }, { status: 400 });
  }

  try {
    const universities = await ownedUniversities(userId, university_ids);
    if (universities.length === 0) return notFound('大学が見つかりません');

    // 単語が、このユーザーの英単語であることを確認する
    const { data: words, error } = await supabaseAdmin
      .from('words')
      .select('id, word_sets(type)')
      .in('id', word_ids)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    if (!words || words.length === 0) return notFound('単語が見つかりません');
    if (words.some((w: any) => w.word_sets?.type !== 'english')) {
      return NextResponse.json({ error: '長文問題の生成は英単語セットのみ対応しています' }, { status: 400 });
    }

    const metas = await listExamMetas(
      userId,
      universities.map((u) => u.id)
    );
    if (metas.length === 0) {
      return NextResponse.json(
        {
          error: `選んだ大学(${universities.map((u) => u.name).join('・')})の過去問が登録されていません。「過去問を登録・管理」から追加してください`,
        },
        { status: 400 }
      );
    }

    const plan = buildPlan({
      exams: metas,
      universityNames: Object.fromEntries(universities.map((u) => [u.id, u.name])),
      wordIds: words.map((w: any) => w.id as string),
    });

    if (!plan) return NextResponse.json({ mode: 'single' });
    return NextResponse.json({ mode: 'multi', plan });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '設計に失敗しました' }, { status: 500 });
  }
}
