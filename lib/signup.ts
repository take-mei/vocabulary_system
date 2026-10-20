import { supabaseAdmin } from '@/lib/supabaseAdmin';

// 新規登録の設定(app_settings テーブル)。APIルート(Node.js Runtime)専用。
//   signup_enabled: 'true' のときだけ新規登録を受け付ける(初期状態は受付停止)
//   signup_code   : 登録コード。空文字なら、コードなしで登録できる
export interface SignupSettings {
  enabled: boolean;
  code: string;
}

// テーブルが無い・読めないなどの場合は「受付停止」として扱う(安全側に倒す)
export async function getSignupSettings(): Promise<SignupSettings> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('key, value')
    .in('key', ['signup_enabled', 'signup_code']);

  if (error || !data) return { enabled: false, code: '' };

  const map = new Map<string, string>(data.map((r: { key: string; value: string }) => [r.key, r.value]));
  return {
    enabled: map.get('signup_enabled') === 'true',
    code: map.get('signup_code') ?? '',
  };
}

export async function saveSignupSettings(
  settings: SignupSettings
): Promise<{ ok: true } | { ok: false; missingTable: boolean }> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('app_settings').upsert(
    [
      { key: 'signup_enabled', value: settings.enabled ? 'true' : 'false', updated_at: now },
      { key: 'signup_code', value: settings.code, updated_at: now },
    ],
    { onConflict: 'key' }
  );
  if (error) {
    return { ok: false, missingTable: error.code === '42P01' || error.code === 'PGRST205' };
  }
  return { ok: true };
}
