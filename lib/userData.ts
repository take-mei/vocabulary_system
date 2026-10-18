import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getSession } from '@/lib/auth';

// APIルート(Node.js Runtime)専用。単語データを「ログイン中のユーザーのものだけ」に絞るための共通処理。
// すべてのデータAPIは service_role で動くので、必ずここの関数でユーザーを確認してから
// user_id で絞り込むこと(絞り込みを忘れると他人のデータが見えてしまう)。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

// ログイン中のユーザーIDを返す(通常はmiddlewareで弾かれているが、念のため)
export async function currentUserId(req: NextRequest): Promise<string | null> {
  const session = await getSession(req);
  return session?.userId ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
}

export function notFound(message = '見つかりません') {
  return NextResponse.json({ error: message }, { status: 404 });
}

// その単語帳が、このユーザーのものか
export async function ownsSet(userId: string, setId: string): Promise<boolean> {
  if (!isUuid(setId)) return false;
  const { data } = await supabaseAdmin
    .from('word_sets')
    .select('id')
    .eq('id', setId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

// 渡されたIDのうち、このユーザーの単語のものだけを返す
export async function ownedWordIds(userId: string, ids: string[]): Promise<string[]> {
  const valid = ids.filter(isUuid);
  const owned: string[] = [];
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100);
    const { data } = await supabaseAdmin
      .from('words')
      .select('id')
      .in('id', chunk)
      .eq('user_id', userId);
    (data ?? []).forEach((r: { id: string }) => owned.push(r.id));
  }
  return owned;
}
