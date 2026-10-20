import { NextResponse } from 'next/server';
import { getSignupSettings } from '@/lib/signup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // ビルド時に固定されないようにする

// ログイン画面が「新規登録」を表示するかどうかを判断するための、公開の情報。
// 登録コードの中身は返さない(必要かどうかだけ)。
export async function GET() {
  const settings = await getSignupSettings();
  return NextResponse.json({ enabled: settings.enabled, codeRequired: settings.code !== '' });
}
