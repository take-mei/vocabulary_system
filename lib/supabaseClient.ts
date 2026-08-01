import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 注意: createClient()をモジュールのトップレベルで呼ぶと、
// ビルド時(ページデータ収集)に環境変数が未設定な場合にビルドが失敗する。
// そのため実際に使われるタイミングまで初期化を遅延させる。
let cachedClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!cachedClient) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      // eslint-disable-next-line no-console
      console.warn(
        'Supabaseの環境変数が設定されていません。.env.localを確認してください。'
      );
    }

    cachedClient = createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder-anon-key'
    );
  }
  return cachedClient;
}

// 既存の呼び出し側 (supabase.from(...) など) をそのまま使えるように、
// プロパティアクセス時に初めてクライアントを生成するProxyとして公開する。
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
