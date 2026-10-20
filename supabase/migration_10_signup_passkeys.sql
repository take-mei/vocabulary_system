-- 新規登録の設定と、パスキーログインのための変更
-- Supabase の SQL Editor で実行してください。コードを反映する「前」に実行します(何度実行しても安全です)。

-- 1) アプリの設定(新規登録の受付 on/off、登録コードなど)
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;

-- 2) パスキー(1人のユーザーが複数登録できる)
create table if not exists app_passkeys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  credential_id text not null unique,   -- パスキーの識別子(base64url)
  public_key text not null,             -- 公開鍵(base64url)。秘密鍵は端末の中にあり、サーバーには届かない
  counter bigint not null default 0,    -- 使用回数(リプレイ攻撃の検知用)
  transports text[],
  device_name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists app_passkeys_user_id_idx on app_passkeys (user_id);

-- RLSを有効化し、ポリシーは作らない => ブラウザ(anonキー)からは一切触れず、サーバー側(service_role)だけが使える
alter table app_passkeys enable row level security;
