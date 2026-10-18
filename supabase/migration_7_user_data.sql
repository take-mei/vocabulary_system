-- 単語帳・単語・学習記録を「ユーザーごと」に分けるための変更(その1)
-- Supabase の SQL Editor で実行してください。コードを反映する「前」に実行します。
-- いまあるデータは、すべてユーザー takeru のものにします。
--
-- 事前準備: ユーザー takeru が存在している必要があります。
--   (無い場合は、管理者でログインして /admin の「ログインアカウント管理」で takeru を追加してください)

-- 1) 持ち主(user_id)の列を追加
alter table word_sets        add column if not exists user_id uuid references app_users(id) on delete cascade;
alter table words            add column if not exists user_id uuid references app_users(id) on delete cascade;
alter table study_logs       add column if not exists user_id uuid references app_users(id) on delete cascade;
alter table word_proficiency add column if not exists user_id uuid references app_users(id) on delete cascade;

-- 2) 既存データをすべて takeru のものにする
do $$
declare
  takeru_id uuid;
begin
  select id into takeru_id from app_users where username = 'takeru';
  if takeru_id is null then
    raise exception 'ユーザー takeru が見つかりません。先に takeru を追加してから、もう一度実行してください。';
  end if;

  update word_sets        set user_id = takeru_id where user_id is null;
  update words            set user_id = takeru_id where user_id is null;
  update study_logs       set user_id = takeru_id where user_id is null;
  update word_proficiency set user_id = takeru_id where user_id is null;
end $$;

-- 3) 検索を速くするための索引
create index if not exists word_sets_user_id_idx        on word_sets (user_id);
create index if not exists words_user_id_idx            on words (user_id);
create index if not exists study_logs_user_id_idx       on study_logs (user_id);
create index if not exists word_proficiency_user_id_idx on word_proficiency (user_id);
