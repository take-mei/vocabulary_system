-- 単語帳・単語・学習記録を「ユーザーごと」に分けるための変更(その2)
-- Supabase の SQL Editor で実行してください。新しいコードを反映して、動作を確認した「後」に実行します。
--
-- やること:
--  1) migration_7 の後〜コード反映までの間に作られて持ち主が空のデータを、takeru のものにする
--  2) 持ち主(user_id)を必須にする
--  3) ブラウザ(anonキー)から、これらのテーブルへ直接アクセスできないようにする
--     => 他のユーザーのデータは、サーバーのAPIを通さないと見えなくなる

do $$
declare
  takeru_id uuid;
begin
  select id into takeru_id from app_users where username = 'takeru';
  if takeru_id is null then
    raise exception 'ユーザー takeru が見つかりません。';
  end if;
  update word_sets        set user_id = takeru_id where user_id is null;
  update words            set user_id = takeru_id where user_id is null;
  update study_logs       set user_id = takeru_id where user_id is null;
  update word_proficiency set user_id = takeru_id where user_id is null;
end $$;

alter table word_sets        alter column user_id set not null;
alter table words            alter column user_id set not null;
alter table study_logs       alter column user_id set not null;
alter table word_proficiency alter column user_id set not null;

-- 既存のアクセス許可ルール(ポリシー)をすべて削除し、RLSを有効にする
-- (ポリシーを作らない = anonキーでは一切読み書きできない。サーバー側のservice_roleだけが使える)
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('word_sets', 'words', 'study_logs', 'word_proficiency')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

alter table word_sets        enable row level security;
alter table words            enable row level security;
alter table study_logs       enable row level security;
alter table word_proficiency enable row level security;
