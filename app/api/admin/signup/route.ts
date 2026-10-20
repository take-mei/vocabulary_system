import { NextRequest, NextResponse } from 'next/server';
import { getSignupSettings, saveSignupSettings } from '@/lib/signup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 新規登録の受付設定(管理者のみ。/api/admin 配下なのでmiddlewareで権限を確認済み)
export async function GET() {
  const settings = await getSignupSettings();
  return NextResponse.json({ data: settings });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { enabled, code } = body as { enabled?: unknown; code?: unknown };

  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled(true/false)は必須です' }, { status: 400 });
  }
  const codeValue = typeof code === 'string' ? code.trim() : '';
  if (codeValue.length > 100) {
    return NextResponse.json({ error: '登録コードは100文字以内にしてください' }, { status: 400 });
  }

  const result = await saveSignupSettings({ enabled, code: codeValue });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.missingTable
          ? 'app_settings テーブルがありません。supabase/migration_10_signup_passkeys.sql を実行してください'
          : '設定を保存できませんでした',
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ data: { enabled, code: codeValue } });
}
