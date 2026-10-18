import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { currentUserId, isUuid, notFound, unauthorized } from '@/lib/userData';

const MODES = ['jp_to_en', 'en_to_jp', 'gen_to_ko', 'ko_to_gen'];

// GET /api/study?set_id=...&archived=true|false
// 単語帳・単語・習熟度をまとめて返す(出題画面/テスト作成画面/オフライン用ダウンロードで使う)。
export async function GET(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const setId = req.nextUrl.searchParams.get('set_id');
  const archived = req.nextUrl.searchParams.get('archived') === 'true';
  if (!isUuid(setId)) return notFound('単語帳が見つかりません');

  const { data: set, error: setError } = await supabaseAdmin
    .from('word_sets')
    .select('*')
    .eq('id', setId)
    .eq('user_id', userId)
    .maybeSingle();
  if (setError) return NextResponse.json({ error: setError.message }, { status: 500 });
  if (!set) return notFound('単語帳が見つかりません');

  let query = supabaseAdmin
    .from('words')
    .select('*')
    .eq('set_id', setId)
    .eq('user_id', userId)
    .eq('archived', archived);
  if (archived) query = query.order('word', { ascending: true });

  const { data: words, error: wordError } = await query;
  if (wordError) return NextResponse.json({ error: wordError.message }, { status: 500 });

  // 習熟度(出題対象の単語のみ)。IDが多いとURLが長くなるので100件ずつ取得する
  const proficiency: Record<string, number> = {};
  const list = words ?? [];
  if (!archived) {
    for (let i = 0; i < list.length; i += 100) {
      const ids = list.slice(i, i + 100).map((w: { id: string }) => w.id);
      const { data: profData, error: profError } = await supabaseAdmin
        .from('word_proficiency')
        .select('word_id, level')
        .eq('user_id', userId)
        .in('word_id', ids);
      if (profError) return NextResponse.json({ error: profError.message }, { status: 500 });
      (profData ?? []).forEach((p: { word_id: string; level: number }) => {
        proficiency[p.word_id] = p.level;
      });
    }
  }

  return NextResponse.json({ set, words: list, proficiency });
}

// POST /api/study
//   { log?: { word_id, mode, is_correct, level }, proficiency?: { word_id, level, updated_at? } }
// 学習ログの記録と、単語ごとの習熟度の更新。対象の単語は必ず自分のものか確認する。
export async function POST(req: NextRequest) {
  const userId = await currentUserId(req);
  if (!userId) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const { log, proficiency } = body as {
    log?: { word_id?: unknown; mode?: unknown; is_correct?: unknown; level?: unknown };
    proficiency?: { word_id?: unknown; level?: unknown; updated_at?: unknown };
  };
  if (!log && !proficiency) {
    return NextResponse.json({ error: 'log か proficiency が必要です' }, { status: 400 });
  }

  const isLevel = (v: unknown): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;

  // 対象の単語がこのユーザーのものか確認し、所属する単語帳IDも取得する
  async function findOwnWord(wordId: unknown) {
    if (!isUuid(wordId)) return null;
    const { data } = await supabaseAdmin
      .from('words')
      .select('id, set_id')
      .eq('id', wordId)
      .eq('user_id', userId)
      .maybeSingle();
    return data as { id: string; set_id: string } | null;
  }

  if (log) {
    if (
      typeof log.mode !== 'string' ||
      !MODES.includes(log.mode) ||
      typeof log.is_correct !== 'boolean' ||
      !isLevel(log.level)
    ) {
      return NextResponse.json({ error: 'log の内容が不正です' }, { status: 400 });
    }
    const word = await findOwnWord(log.word_id);
    if (!word) return notFound('単語が見つかりません');

    const { error } = await supabaseAdmin.from('study_logs').insert({
      user_id: userId,
      word_id: word.id,
      set_id: word.set_id,
      mode: log.mode,
      is_correct: log.is_correct,
      level: log.level,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (proficiency) {
    if (!isLevel(proficiency.level)) {
      return NextResponse.json({ error: 'proficiency の内容が不正です' }, { status: 400 });
    }
    const word = await findOwnWord(proficiency.word_id);
    if (!word) return notFound('単語が見つかりません');

    const updatedAt =
      typeof proficiency.updated_at === 'string' && !Number.isNaN(Date.parse(proficiency.updated_at))
        ? proficiency.updated_at
        : new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('word_proficiency')
      .upsert(
        { user_id: userId, word_id: word.id, level: proficiency.level, updated_at: updatedAt },
        { onConflict: 'word_id' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
