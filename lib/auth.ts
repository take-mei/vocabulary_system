import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest, NextResponse } from 'next/server';

// このファイルはmiddleware(Edge Runtime)からも使うため、Node専用モジュールをimportしないこと。
// ロール(一般ユーザー/管理者)はセッションには入れず、毎回DB(app_users.role)で判定する。
// => 権限を変更/削除すると、すぐ(約30秒以内)反映される。

export const SESSION_COOKIE = 'word_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30日

function getKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET が未設定、または短すぎます(16文字以上)。');
  }
  return new TextEncoder().encode(secret);
}

export interface SessionInfo {
  userId: string; // app_users.id
  username: string;
}

export async function createSessionToken(user: SessionInfo): Promise<string> {
  return new SignJWT({ username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getKey());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionInfo | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') return null;
    return { userId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

// APIルートから、ログイン中のユーザーを取り出す(未ログインならnull)
export async function getSession(req: NextRequest): Promise<SessionInfo | null> {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
}

// ログイン成功時に、セッションCookieをレスポンスにセットする(パスワード/パスキー/新規登録で共通)
export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

// ---------------------------------------------------------------
// パスキー(WebAuthn)用: 発行した「チャレンジ」を、短時間だけ署名付きCookieに預けておく。
// サーバーは状態を持たないので、「options」と「verify」の2回のリクエストをこれでつなぐ。
// ---------------------------------------------------------------
export const CHALLENGE_COOKIE = 'word_chal';
export const CHALLENGE_MAX_AGE = 60 * 5; // 5分

export type ChallengePurpose = 'passkey-register' | 'passkey-login';

export async function createChallengeToken(
  challenge: string,
  purpose: ChallengePurpose,
  userId?: string
): Promise<string> {
  return new SignJWT({ challenge, purpose, uid: userId ?? null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_MAX_AGE}s`)
    .sign(getKey());
}

export async function verifyChallengeToken(
  token: string | undefined,
  purpose: ChallengePurpose
): Promise<{ challenge: string; userId: string | null } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
    if (payload.purpose !== purpose || typeof payload.challenge !== 'string') return null;
    return { challenge: payload.challenge, userId: typeof payload.uid === 'string' ? payload.uid : null };
  } catch {
    return null;
  }
}

export function setChallengeCookie(res: NextResponse, token: string) {
  res.cookies.set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/passkey',
    maxAge: CHALLENGE_MAX_AGE,
  });
}

export function clearChallengeCookie(res: NextResponse) {
  res.cookies.set(CHALLENGE_COOKIE, '', { path: '/api/passkey', maxAge: 0 });
}
