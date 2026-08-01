import { createClient } from '@supabase/supabase-js';

// このファイルはAPIルート（サーバー側）でのみimportすること。
// service roleキーは絶対にクライアントコンポーネントに渡さない。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
