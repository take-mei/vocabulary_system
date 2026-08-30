import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateEnglishPassage } from '@/lib/gemini';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { word_ids } = body as { word_ids?: string[] };

  if (!Array.isArray(word_ids) || word_ids.length === 0) {
    return NextResponse.json({ error: 'word_ids が必要です' }, { status: 400 });
  }

  try {
    const { data: words, error } = await supabaseAdmin
      .from('words')
      .select('*, word_sets(type)')
      .in('id', word_ids);

    if (error || !words || words.length === 0) {
      throw new Error(error?.message ?? '単語が見つかりません');
    }

    const nonEnglish = words.some((w: any) => w.word_sets?.type !== 'english');
    if (nonEnglish) {
      return NextResponse.json(
        { error: '長文問題の生成は英単語セットのみ対応しています' },
        { status: 400 }
      );
    }

    const passage = await generateEnglishPassage(
      words.map((w: any) => ({ word: w.word, mean: w.mean }))
    );

    return NextResponse.json({ data: passage });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '長文問題の生成に失敗しました' },
      { status: e?.status === 429 ? 429 : 500 }
    );
  }
}
