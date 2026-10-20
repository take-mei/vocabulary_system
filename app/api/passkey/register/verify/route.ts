import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { CHALLENGE_COOKIE, clearChallengeCookie, getSession, verifyChallengeToken } from '@/lib/auth';
import { getRp, toBase64Url } from '@/lib/webauthn';

export const runtime = 'nodejs';

const MAX_PASSKEYS = 10;

// パスキー登録の第2段階: ブラウザから届いた結果を検証して、公開鍵を保存する。
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { response, name } = body as { response?: RegistrationResponseJSON; name?: unknown };
  if (!response) return NextResponse.json({ error: '登録情報がありません' }, { status: 400 });

  // 第1段階で発行したチャレンジ(同じユーザーに対して発行したものだけ有効)
  const challenge = await verifyChallengeToken(req.cookies.get(CHALLENGE_COOKIE)?.value, 'passkey-register');
  if (!challenge || challenge.userId !== session.userId) {
    return NextResponse.json({ error: '有効期限が切れました。もう一度やり直してください' }, { status: 400 });
  }

  const { count } = await supabaseAdmin
    .from('app_passkeys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.userId);
  if ((count ?? 0) >= MAX_PASSKEYS) {
    return NextResponse.json({ error: `パスキーは${MAX_PASSKEYS}個まで登録できます` }, { status: 400 });
  }

  const { rpID, origin } = getRp(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return NextResponse.json({ error: 'パスキーを登録できませんでした' }, { status: 400 });
  }
  if (!verification.verified) {
    return NextResponse.json({ error: 'パスキーを登録できませんでした' }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  const deviceName =
    typeof name === 'string' && name.trim() ? name.trim().slice(0, 50) : `パスキー ${(count ?? 0) + 1}`;

  const { error } = await supabaseAdmin.from('app_passkeys').insert({
    user_id: session.userId,
    credential_id: credential.id,
    public_key: toBase64Url(credential.publicKey),
    counter: credential.counter,
    transports: response.response.transports ?? credential.transports ?? null,
    device_name: deviceName,
  });
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'このパスキーは既に登録されています' }, { status: 409 });
    }
    return NextResponse.json({ error: 'パスキーを保存できませんでした' }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  clearChallengeCookie(res);
  return res;
}
