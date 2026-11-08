-- 大学別の過去問(長文問題の参考資料)のための変更
-- Supabase の SQL Editor で実行してください。コードを反映する「前」に実行します(何度実行しても安全です)。
--
--  universities … 大学(ユーザーごと)
--  past_exams   … 大学ごとの過去問。件数の上限はありません(1大学に何件でも登録できます)

create table if not exists universities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists universities_user_id_idx on universities (user_id);

create table if not exists past_exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  university_id uuid not null references universities(id) on delete cascade,
  title text not null default '',
  content text not null,
  -- 一覧で本文を読み込まずに文字数を出すための列(本文から自動計算)
  char_count integer generated always as (char_length(content)) stored,
  created_at timestamptz not null default now()
);
create index if not exists past_exams_university_id_idx on past_exams (university_id, created_at);
create index if not exists past_exams_user_id_idx on past_exams (user_id);

-- RLSを有効化し、ポリシーは作らない => ブラウザ(anonキー)からは一切触れず、サーバー側(service_role)だけが使える
alter table universities enable row level security;
alter table past_exams   enable row level security;
