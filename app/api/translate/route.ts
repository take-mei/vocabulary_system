import { NextRequest, NextResponse } from 'next/server';
import { getTranslationFromGemini } from '@/lib/gemini';
import { WordSetType } from '@/lib/types';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { word, type } = body as { word?: string; type?: WordSetType };

  if (!word || !type || !['english', 'kobun'].includes(type)) {
    return NextResponse.json(
      { error: 'word と type(english|kobun) が必要です' },
      { status: 400 }
    );
  }

  try {
    const { mean, phonetic } = await getTranslationFromGemini({ word, type });
    return NextResponse.json({ mean, phonetic });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '翻訳に失敗しました' },
      { status: 500 }
    );
  }
}
