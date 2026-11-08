import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isUuid } from '@/lib/userData';

// APIルート(サーバー側)専用。大学・過去問まわりの共通処理。
// 過去問は何件でも登録できるが、Geminiに渡せる量には限りがあるため、
// 長文を作るたびに「登録済みの中から無作為に数件」を選んで参考資料にする。
// (毎回違う過去問が選ばれるので、登録が増えるほど、作られる長文の幅も広がる)

export const PROMPT_MAX_EXAMS = 3; // 1回の生成で参考にする過去問の最大件数
export const PROMPT_MAX_CHARS_PER_EXAM = 9000; // 1件あたりプロンプトに入れる最大文字数(超えた分は切り捨て)
export const PROMPT_MAX_TOTAL_CHARS = 24000; // 合計の最大文字数

export interface ReferenceExam {
  title: string;
  content: string;
}

export interface ReferenceSet {
  universityName: string;
  exams: ReferenceExam[];
}

// その大学が、このユーザーのものか(持ち主なら名前を返す)
export async function ownedUniversity(
  userId: string,
  universityId: string
): Promise<{ id: string; name: string } | null> {
  if (!isUuid(universityId)) return null;
  const { data } = await supabaseAdmin
    .from('universities')
    .select('id, name')
    .eq('id', universityId)
    .eq('user_id', userId)
    .maybeSingle();
  return data ?? null;
}

function pickDistinctIndexes(total: number, count: number): number[] {
  const n = Math.min(total, count);
  const picked = new Set<number>();
  while (picked.size < n) picked.add(Math.floor(Math.random() * total));
  return Array.from(picked);
}

// 長文生成の参考にする過去問を選ぶ。大学が無い場合は null、過去問が無い場合は exams が空。
export async function pickReferenceExams(
  userId: string,
  universityId: string
): Promise<ReferenceSet | null> {
  const university = await ownedUniversity(userId, universityId);
  if (!university) return null;

  const { count, error: countError } = await supabaseAdmin
    .from('past_exams')
    .select('id', { count: 'exact', head: true })
    .eq('university_id', university.id)
    .eq('user_id', userId);
  if (countError) throw new Error(countError.message);

  const total = count ?? 0;
  if (total === 0) return { universityName: university.name, exams: [] };

  // 件数が多くても(PostgRESTの1000行制限があっても)困らないよう、
  // 無作為に選んだ位置の1行だけを取りに行く
  const exams: ReferenceExam[] = [];
  let used = 0;
  for (const index of pickDistinctIndexes(total, PROMPT_MAX_EXAMS)) {
    if (used >= PROMPT_MAX_TOTAL_CHARS) break;
    const { data, error } = await supabaseAdmin
      .from('past_exams')
      .select('title, content')
      .eq('university_id', university.id)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(index, index);
    if (error) throw new Error(error.message);
    const row = data?.[0];
    if (!row) continue;

    const room = Math.min(PROMPT_MAX_CHARS_PER_EXAM, PROMPT_MAX_TOTAL_CHARS - used);
    const content = String(row.content).trim().slice(0, room);
    if (!content) continue;
    exams.push({ title: String(row.title || '').trim(), content });
    used += content.length;
  }

  return { universityName: university.name, exams };
}
