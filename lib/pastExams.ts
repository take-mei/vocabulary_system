import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isUuid } from '@/lib/userData';
import { ExamAnalysis } from '@/lib/types';
import { normalizeAnalysis } from '@/lib/examAnalysis';
import { ExamMeta, examLabel, examWeight, weightedSample } from '@/lib/examPlan';

// APIルート(サーバー側)専用。大学・過去問まわりの共通処理。
// 過去問は何件でも登録できるが、Geminiに渡せる量には限りがあるため、
// 長文を作るたびに「登録済みの中から、新しい年のものほど選ばれやすいように重み付けして数件」を選ぶ。

export const PROMPT_MAX_EXAMS = 3; // 1回の生成で抜粋を渡す過去問の最大件数
export const PROMPT_MAX_CHARS_PER_EXAM = 9000; // 1件あたりプロンプトに入れる最大文字数(超えた分は切り捨て)
export const PROMPT_MAX_TOTAL_CHARS = 24000; // 合計の最大文字数
// 大学ごとに、新しい順にこの件数まで(年の新しいものほど重く扱うので、古い分は切り捨てても影響が小さい)を重み付けの対象にする
export const META_LIMIT_PER_QUERY = 1000;

export interface ReferenceExam {
  title: string;
  content: string;
}

export interface ReferenceSet {
  universityName: string;
  exams: ReferenceExam[];
}

export interface OwnedUniversity {
  id: string;
  name: string;
}

// 渡されたIDのうち、このユーザーの大学だけを返す(重複・不正なIDは除く)
export async function ownedUniversities(userId: string, ids: unknown): Promise<OwnedUniversity[]> {
  if (!Array.isArray(ids)) return [];
  const valid = Array.from(new Set(ids.filter(isUuid)));
  if (valid.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('universities')
    .select('id, name')
    .in('id', valid)
    .eq('user_id', userId);
  return (data ?? []) as OwnedUniversity[];
}

// その大学が、このユーザーのものか(持ち主なら名前を返す)
export async function ownedUniversity(userId: string, universityId: string): Promise<OwnedUniversity | null> {
  if (!isUuid(universityId)) return null;
  return (await ownedUniversities(userId, [universityId]))[0] ?? null;
}

// 選んだ大学の過去問のメタ情報(本文は含めない)。年の新しい順
export async function listExamMetas(userId: string, universityIds: string[]): Promise<ExamMeta[]> {
  const { data, error } = await supabaseAdmin
    .from('past_exams')
    .select('id, university_id, title, year, analysis')
    .in('university_id', universityIds)
    .eq('user_id', userId)
    .order('year', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(0, META_LIMIT_PER_QUERY - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    university_id: r.university_id,
    title: r.title ?? '',
    year: typeof r.year === 'number' ? r.year : null,
    analysis: normalizeAnalysis(r.analysis) as ExamAnalysis | null,
  }));
}

// 指定した過去問の本文(抜粋)を取り出す。持ち主のものだけ。文字数の上限を守る
export async function loadExcerpts(
  userId: string,
  examIds: string[],
  labels?: Record<string, string>
): Promise<{ label: string; content: string }[]> {
  const ids = examIds.filter(isUuid).slice(0, PROMPT_MAX_EXAMS);
  if (ids.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from('past_exams')
    .select('id, title, year, content')
    .in('id', ids)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);

  const byId = new Map((data ?? []).map((r: any) => [r.id as string, r]));
  const out: { label: string; content: string }[] = [];
  let used = 0;
  for (const id of ids) {
    const row = byId.get(id) as any;
    if (!row || used >= PROMPT_MAX_TOTAL_CHARS) continue;
    const room = Math.min(PROMPT_MAX_CHARS_PER_EXAM, PROMPT_MAX_TOTAL_CHARS - used);
    const content = String(row.content).trim().slice(0, room);
    if (!content) continue;
    out.push({ label: labels?.[id] ?? examLabel('', row.year ?? null, String(row.title ?? '')), content });
    used += content.length;
  }
  return out;
}

// 大問構成を解析していない過去問しかない場合の「1題だけ作る」方式で、参考にする過去問を選ぶ。
// 大学が1つも見つからなければ null、過去問が無ければ exams が空。
export async function pickReferenceExams(userId: string, universityIds: unknown): Promise<ReferenceSet | null> {
  const universities = await ownedUniversities(userId, universityIds);
  if (universities.length === 0) return null;
  const universityName = universities.map((u) => u.name).join('・');

  const metas = await listExamMetas(
    userId,
    universities.map((u) => u.id)
  );
  if (metas.length === 0) return { universityName, exams: [] };

  const years = metas.map((m) => m.year).filter((y): y is number => y !== null);
  const newest = years.length > 0 ? Math.max(...years) : null;
  const picked = weightedSample(metas, (m) => examWeight(m.year, newest), PROMPT_MAX_EXAMS);

  const excerpts = await loadExcerpts(
    userId,
    picked.map((m) => m.id)
  );
  const pickedOrder = new Map(picked.map((m, i) => [i, m]));
  return {
    universityName,
    exams: excerpts.map((e, i) => ({
      title: [pickedOrder.get(i)?.year ? `${pickedOrder.get(i)!.year}年` : '', pickedOrder.get(i)?.title ?? '']
        .filter(Boolean)
        .join(' '),
      content: e.content,
    })),
  };
}
