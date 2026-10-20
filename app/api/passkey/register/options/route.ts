import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createChallengeToken, getSession, setChallengeCookie } from '@/lib/auth';
import { RP_NAME, getRp } from '@/lib/webauthn';

export const runtime = 'nodejs';

// パスキー登録の第1段階: ブラウザに渡す「登録の指示(options)」を作る。ログイン中のユーザーのみ。
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });

  const { data: existing } = await supabaseAdmin
    .from('app_passkeys')
    .select('credential_id, transports')
    .eq('user_id', session.userId);

  const { rpID } = getRp(req);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: session.username,
    userDisplayName: session.username,
    userID: new TextEncoder().encode(session.userId),
    attestationType: 'none',
    // 同じ端末のパスキーを二重に登録しないようにする
    excludeCredentials: (existing ?? []).map((p: { credential_id: string; transports: string[] | null }) => ({
      id: p.credential_id,
      transports: p.transports ?? undefined,
    })),
    // IDを入力しなくてもログインできる「パスキー」にし、本人確認(生体認証/PIN)を必須にする
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });

  const res = NextResponse.json(options);
  setChallengeCookie(res, await createChallengeToken(options.challenge, 'passkey-register', session.userId));
  return res;
}
