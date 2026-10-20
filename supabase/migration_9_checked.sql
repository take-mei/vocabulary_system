-- 「チェックした単語」機能のための変更
-- Supabase の SQL Editor で実行してください。コードを反映する「前」に実行します(何度実行しても安全です)。
alter table words add column if not exists checked boolean not null default false;

-- チェック済みの単語だけを素早く取り出すための索引
create index if not exists words_user_checked_idx on words (user_id) where checked;
