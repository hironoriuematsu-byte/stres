-- ============================================================
-- 0031: 受検を始めたのに回答を送っていない人への催促(1回だけ)
--   - 受検の画面(回答フォーム)を開いた日時を、年度ごとに1人1行記録する
--   - 毎日のお知らせ処理(Vercel Cron)が、開いてから3日たっても当年度の結果がない人に、1回だけ催促メールを送る
--   - 書き込み・閲覧はサーバー(service_role)経由のみ。実施者(office)は確認のため閲覧できる
-- 何度実行しても同じ結果になる
-- ============================================================

create table if not exists public.exam_attempts (
  user_id      uuid not null references auth.users(id) on delete cascade,
  fiscal_year  int not null,
  company_id   uuid not null references public.companies(id) on delete cascade,
  started_at   timestamptz not null default now(),   -- 受検の画面を最初に開いた日時
  reminded_at  timestamptz,                          -- 催促メールを送った日時(1回だけ)
  primary key (user_id, fiscal_year)
);

create index if not exists idx_exam_attempts_pending on public.exam_attempts (fiscal_year, started_at) where reminded_at is null;

alter table public.exam_attempts enable row level security;

drop policy if exists exam_attempts_read_office on public.exam_attempts;
create policy exam_attempts_read_office on public.exam_attempts
  for select using (my_role() = 'office');

revoke all on table public.exam_attempts from anon;
revoke insert, update, delete on table public.exam_attempts from authenticated;
grant select on table public.exam_attempts to authenticated;

select 'OK: 0031 exam_attempts' as result;
