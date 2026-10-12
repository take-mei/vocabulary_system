import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Node.js Runtime専用(APIルートからのみ使うこと。middlewareからはimportしない)。
// 保存形式: scrypt:<saltのhex>:<hashのhex>
// scripts/hash-password.mjs も同じ形式を出力する。
const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ユーザーが存在しない場合も同程度の時間をかけて、ID存在有無を応答時間から推測されにくくする。
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password');
  await verifyPassword(password, await dummyHash);
}

// ---------------------------------------------------------------
// 管理者パスワード
//   1) DB(app_settings の admin_password_hash)に保存されていればそれを使う
//   2) まだ無ければ、環境変数 ADMIN_PASSWORD を使う(最初の設定用)
// アプリ内で一度変更すると以降はDBの値が優先され、環境変数は使われない。
// 忘れた場合は、SQLで app_settings の該当行を削除すると環境変数に戻る。
// ---------------------------------------------------------------
const ADMIN_KEY = 'admin_password_hash';

function sha256(s: string) {
  return createHash('sha256').update(s).digest();
}

// テーブル自体がまだ無い(migration_5未実行)ことを示すエラーか
function isMissingTable(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export type AdminCheck = 'ok' | 'wrong' | 'not-configured' | 'error';

export async function verifyAdminPassword(password: string): Promise<AdminCheck> {
  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', ADMIN_KEY)
    .maybeSingle();

  if (error && !isMissingTable(error)) {
    // DBの一時的な不調時に、古い環境変数のパスワードで通してしまわないよう失敗扱いにする
    return 'error';
  }
  if (!error && data?.value) {
    return (await verifyPassword(password, data.value)) ? 'ok' : 'wrong';
  }

  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword) return 'not-configured';
  return timingSafeEqual(sha256(password), sha256(envPassword)) ? 'ok' : 'wrong';
}

export async function setAdminPassword(
  newPassword: string
): Promise<{ ok: true } | { ok: false; missingTable: boolean }> {
  const value = await hashPassword(newPassword);
  const { error } = await supabaseAdmin
    .from('app_settings')
    .upsert({ key: ADMIN_KEY, value, updated_at: new Date().toISOString() });
  if (error) return { ok: false, missingTable: isMissingTable(error) };
  return { ok: true };
}
