import { createClient, SupabaseClient } from '@supabase/supabase-js';

// このファイルはAPIルート（サーバー側）でのみimportすること。
// service roleキーは絶対にクライアントコンポーネントに渡さない。
//
// 注意: createClient()をモジュールのトップレベルで呼ぶと、
// ビルド時(ページデータ収集)に環境変数が未設定な場合にビルドが失敗する。
// そのため実際にAPIルートから使われるタイミングまで初期化を遅延させる。
let cachedClient: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (!cachedClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'Supabaseの環境変数(NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)が設定されていません。'
      );
    }

    cachedClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return cachedClient;
}

// 既存の呼び出し側 (supabaseAdmin.from(...) など) をそのまま使えるように、
// プロパティアクセス時に初めてクライアントを生成するProxyとして公開する。
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
