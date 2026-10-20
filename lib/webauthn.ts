import { NextRequest } from 'next/server';

// パスキー(WebAuthn)の共通設定。APIルート(Node.js Runtime)専用。

export const RP_NAME = '単語帳アプリ';

// このサイトのドメイン(RP ID)とオリジン。リクエストのホスト名から決める。
// 独自ドメインなどで固定したい場合は、環境変数 WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN で上書きできる。
// ※パスキーは「そのドメイン専用」。ドメインを変えると、登録済みのパスキーは使えなくなる
//   (パスワードでのログインは、そのまま使える)。
export function getRp(req: NextRequest): { rpID: string; origin: string } {
  const envRp = process.env.WEBAUTHN_RP_ID;
  const envOrigin = process.env.WEBAUTHN_ORIGIN;
  if (envRp && envOrigin) return { rpID: envRp, origin: envOrigin };

  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost').split(',')[0].trim();
  const rpID = host.replace(/:\d+$/, '');
  const isLocal = rpID === 'localhost' || rpID === '127.0.0.1';
  const proto = isLocal ? 'http' : 'https';
  return { rpID, origin: `${proto}://${host}` };
}

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(value, 'base64url');
  const out = new Uint8Array(new ArrayBuffer(buf.length));
  out.set(buf);
  return out;
}
