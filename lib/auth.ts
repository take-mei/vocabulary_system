import { SignJWT, jwtVerify } from 'jose';

// このファイルはmiddleware(Edge Runtime)からも使うため、Node専用モジュールをimportしないこと。

export const SESSION_COOKIE = 'word_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30日

// 管理者画面に入るための追加の認証(管理者パスワード)。通常ログインとは別Cookie・短い有効期限。
export const ADMIN_COOKIE = 'word_admin';
export const ADMIN_MAX_AGE = 60 * 60 * 2; // 2時間

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
    // 管理者トークンを通常セッションとして使い回せないようにする
    if (payload.scope === 'admin') return null;
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') return null;
    return { userId: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

export async function createAdminToken(userId: string): Promise<string> {
  return new SignJWT({ scope: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_MAX_AGE}s`)
    .sign(getKey());
}

// 管理者トークンが有効で、かつ指定ユーザー本人に発行されたものか
export async function verifyAdminToken(
  token: string | undefined,
  userId: string
): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
    return payload.scope === 'admin' && payload.sub === userId;
  } catch {
    return false;
  }
}
