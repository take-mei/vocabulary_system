import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { createChallengeToken, setChallengeCookie } from '@/lib/auth';
import { getRp } from '@/lib/webauthn';

export const runtime = 'nodejs';

// パスキーでログインの第1段階(ログイン前に呼ばれる)。
// IDを入力せず、端末に保存されたパスキーの中から選んでログインする方式。
export async function POST(req: NextRequest) {
  const { rpID } = getRp(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });

  const res = NextResponse.json(options);
  setChallengeCookie(res, await createChallengeToken(options.challenge, 'passkey-login'));
  return res;
}
