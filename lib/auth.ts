import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

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
