import { NextRequest, NextResponse } from 'next/server';
import { setAdminPassword, verifyAdminPassword } from '@/lib/password';

export const runtime = 'nodejs';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 管理者パスワードの変更。管理者認証はmiddlewareで済んでいるが、念のため現在のパスワードも再確認する。
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return NextResponse.json({ error: '現在のパスワードと新しいパスワードを入力してください' }, { status: 400 });
  }
  if (newPassword.length < 8 || newPassword.length > 200) {
    return NextResponse.json({ error: '新しいパスワードは8文字以上200文字以下にしてください' }, { status: 400 });
  }

  const check = await verifyAdminPassword(currentPassword);
  if (check === 'error' || check === 'not-configured') {
    return NextResponse.json({ error: '認証処理に失敗しました' }, { status: 500 });
  }
  if (check !== 'ok') {
    await sleep(800);
    return NextResponse.json({ error: '現在の管理者パスワードが違います' }, { status: 401 });
  }

  const result = await setAdminPassword(newPassword);
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.missingTable
          ? 'app_settings テーブルがありません。supabase/migration_5_settings.sql を実行してください'
          : '管理者パスワードの保存に失敗しました',
      },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
