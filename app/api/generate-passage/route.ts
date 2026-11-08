import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateEnglishPassage } from '@/lib/gemini';
import { currentUserId, isUuid, notFound, unauthorized } from '@/lib/userData';
import { pickReferenceExams } from '@/lib/pastExams';

// 過去問を参考にする分、プロンプトが長くなり生成にも時間がかかるため、実行時間の上限を広げておく
export const maxDuration = 60;

// --- 選択した単語のうち、本文で実際に使われたものを調べる(目安) ---
// Geminiの申告(used_words)だけに頼らず、本文に単語(活用変化を含む)が現れるかを確認する。
function normalizeWord(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[~〜….?!,;:"“”]/g, ' ')
    .replace(/^to\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function partAppears(part: string, text: string): boolean {
  if (!/^[a-z'-]+$/.test(part)) {
    // 英字以外(記号・数字など)を含む語は、そのままの形で探す
    return text.includes(part);
  }
  let pattern: string;
  if (part.length <= 4) {
    // 短い語は別の語に誤って一致しないよう、代表的な語尾変化だけを許す
    pattern = `\\b${escapeRegExp(part)}(?:s|es|ed|d|ing)?\\b`;
    if (part.endsWith('e')) pattern += `|\\b${escapeRegExp(part.slice(0, -1))}ing\\b`;
  } else {
    // 長い語は語幹(末尾2文字を除いた部分)が一致すれば、活用変化・派生語も使われたとみなす
    const stem = part.slice(0, Math.max(4, part.length - 2));
    pattern = `\\b${escapeRegExp(stem)}\\w*`;
  }
  return new RegExp(pattern, 'i').test(text);
}

function wordAppearsInText(word: string, text: string): boolean {
  const parts = normalizeWord(word).split(/[\s/]+/).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => partAppears(p, text));
}

export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { word_ids, university_id } = body as { word_ids?: string[]; university_id?: string | null };

  if (!Array.isArray(word_ids) || word_ids.length === 0) {
    return NextResponse.json({ error: 'word_ids が必要です' }, { status: 400 });
  }
  if (!word_ids.every(isUuid)) {
    return NextResponse.json({ error: 'word_ids が不正です' }, { status: 400 });
  }
  // university_id は任意(指定なしなら、これまで通り過去問なしで作る)
  if (university_id != null && !isUuid(university_id)) {
    return NextResponse.json({ error: 'university_id が不正です' }, { status: 400 });
  }

  try {
    const { data: words, error } = await supabaseAdmin
      .from('words')
      .select('*, word_sets(type)')
      .in('id', word_ids)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    if (!words || words.length === 0) return notFound('単語が見つかりません');

    const nonEnglish = words.some((w: any) => w.word_sets?.type !== 'english');
    if (nonEnglish) {
      return NextResponse.json(
        { error: '長文問題の生成は英単語セットのみ対応しています' },
        { status: 400 }
      );
    }

    // 大学が選ばれていれば、その大学の過去問(登録済みの中から無作為に数件)を参考資料にする
    let reference: { universityName: string; exams: { title: string; content: string }[] } | undefined;
    if (university_id) {
      const picked = await pickReferenceExams(userId, university_id);
      if (!picked) return notFound('大学が見つかりません');
      if (picked.exams.length === 0) {
        return NextResponse.json(
          {
            error: `「${picked.universityName}」の過去問が登録されていません。「過去問を登録・管理」から追加してください`,
          },
          { status: 400 }
        );
      }
      reference = picked;
    }

    const passage = await generateEnglishPassage(
      words.map((w: any) => ({ word: w.word, mean: w.mean })),
      reference
    );
    if (reference) {
      passage.university_name = reference.universityName;
      passage.reference_titles = reference.exams.map((e, i) => e.title || `過去問${i + 1}`);
    }

    // 選択した単語のうち、使われた数と、使われなかった単語(IDで返す)を付け足す
    const text = `${passage.title}\n${passage.passage}`;
    const unused = words.filter((w: any) => !wordAppearsInText(w.word, text));
    passage.selected_count = words.length;
    passage.used_count = words.length - unused.length;
    passage.unused_word_ids = unused.map((w: any) => w.id);

    return NextResponse.json({ data: passage });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? '長文問題の生成に失敗しました' },
      { status: e?.status === 429 ? 429 : 500 }
    );
  }
}
