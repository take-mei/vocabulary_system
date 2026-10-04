import { SignJWT, jwtVerify } from 'jose';

// このファイルはmiddleware(Edge Runtime)からも使うため、Node専用モジュールをimportしないこと。

export const SESSION_COOKIE = 'word_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30日

function getKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('AUTH_SECRET が未設定、または短すぎます(16文字以上)。');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(username: string): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getKey());
}

export async function verifySessionToken(
  token: string | undefined
): Promise<{ username: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getKey(), { algorithms: ['HS256'] });
    return typeof payload.username === 'string' ? { username: payload.username } : null;
  } catch {
    return null;
  }
}
