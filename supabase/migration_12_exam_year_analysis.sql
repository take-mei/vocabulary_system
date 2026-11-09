-- 過去問の「年(任意)」と「大問構成の解析結果」のための変更
-- Supabase の SQL Editor で実行してください。コードを反映する「前」に実行します(何度実行しても安全です)。
--
--  year        … 過去問の年度(西暦。任意)。新しい年ほど、長文を作るときに重く扱われる
--  analysis    … Geminiが過去問から読み取った大問構成・問題文の特性(JSON)
--  analyzed_at … 解析した日時(未解析ならnull)

alter table past_exams add column if not exists year integer;
alter table past_exams add column if not exists analysis jsonb;
alter table past_exams add column if not exists analyzed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'past_exams_year_range') then
    alter table past_exams add constraint past_exams_year_range check (year is null or (year between 1900 and 2100));
  end if;
end $$;

create index if not exists past_exams_university_year_idx on past_exams (university_id, year desc nulls last);
