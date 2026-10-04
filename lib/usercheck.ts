// middleware(Edge Runtime)から使う。Node専用モジュールをimportしないこと。
//
// セッション(JWT)は署名が正しければ有効期限まで通ってしまうため、
// 管理画面でユーザーを削除しても、そのままだと最大30日ログインしたままになる。
// それを防ぐため、ユーザーがDBにまだ存在するかをSupabaseに問い合わせる。
// リクエストごとに問い合わせると遅いので、同じインスタンス内で短時間だけ結果をキャッシュする。
// => 削除から最大でおよそ TTL 秒後に、そのユーザーはログアウト状態になる。
const TTL_MS = 30_000;
const verifiedUntil = new Map<string, number>();

export async function userStillExists(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = verifiedUntil.get(userId);
  if (cached && cached > now) return true;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true; // 設定不備はここでは判断しない(APIルート側でエラーになる)

  try {
    const res = await fetch(
      `${url}/rest/v1/app_users?select=id&id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' }
    );
    if (!res.ok) return true; // Supabase側の一時的な不調でログイン済みの人を締め出さない
    const rows = (await res.json()) as unknown[];
    if (rows.length === 0) {
      verifiedUntil.delete(userId);
      return false;
    }
    if (verifiedUntil.size > 500) verifiedUntil.clear();
    verifiedUntil.set(userId, now + TTL_MS);
    return true;
  } catch {
    return true;
  }
}
