import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  CHALLENGE_COOKIE,
  clearChallengeCookie,
  createSessionToken,
  setSessionCookie,
  verifyChallengeToken,
} from '@/lib/auth';
import { fromBase64Url, getRp } from '@/lib/webauthn';

export const runtime = 'nodejs';

const FAIL = () => NextResponse.json({ error: 'パスキーでログインできませんでした' }, { status: 401 });

// パスキーでログインの第2段階: 署名を検証して、成功したらセッションを発行する。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { response } = body as { response?: AuthenticationResponseJSON };
  if (!response || typeof response.id !== 'string') return FAIL();

  const challenge = await verifyChallengeToken(req.cookies.get(CHALLENGE_COOKIE)?.value, 'passkey-login');
  if (!challenge) return FAIL();

  // 使われたパスキー → その持ち主
  const { data: passkey } = await supabaseAdmin
    .from('app_passkeys')
    .select('id, user_id, credential_id, public_key, counter, transports')
    .eq('credential_id', response.id)
    .maybeSingle();
  if (!passkey) return FAIL();

  const { data: user } = await supabaseAdmin
    .from('app_users')
    .select('id, username')
    .eq('id', passkey.user_id)
    .maybeSingle();
  if (!user) return FAIL();

  // パスキーに記録されている持ち主(userHandle)と、DB上の持ち主が一致するか
  const handle = response.response.userHandle;
  if (handle && Buffer.from(handle, 'base64url').toString('utf-8') !== user.id) return FAIL();

  const { rpID, origin } = getRp(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credential_id,
        publicKey: fromBase64Url(passkey.public_key),
        counter: Number(passkey.counter),
        transports: passkey.transports ?? undefined,
      },
      requireUserVerification: true,
    });
  } catch {
    return FAIL();
  }
  if (!verification.verified) return FAIL();

  // 使用回数と最終使用日時を更新(使用回数が戻っていた場合は、上の検証で拒否される)
  await supabaseAdmin
    .from('app_passkeys')
    .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq('id', passkey.id);

  const token = await createSessionToken({ userId: user.id, username: user.username });
  const res = NextResponse.json({ ok: true, username: user.username });
  setSessionCookie(res, token);
  clearChallengeCookie(res);
  return res;
}
