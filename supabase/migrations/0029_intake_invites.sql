-- ============================================================
-- 0029: 事前ヒアリング(AI)の案内と催促の記録
--   - 申出のあとに送った案内(受付確認メール・実施者が送った案内)と、未回答者への催促の回数を記録する
--   - 本人が「今回は受けない」を選んだら、それ以降は催促しない
--   - 閲覧できるのは実施者(office)だけ。書き込みはサーバー(service_role)経由のみ
-- 何度実行しても同じ結果になる(0028 の実行後に実行する)
-- ============================================================

create table if not exists public.interview_intake_invites (
  request_id    uuid primary key references public.interview_requests(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  first_sent_at timestamptz,                   -- 最初の案内
  last_sent_at  timestamptz,                   -- 最後に送った案内・催促
  sent_count    int not null default 0,        -- 案内と催促の合計回数
  declined_at   timestamptz,                   -- 本人が「今回は受けない」を選んだ時刻
  updated_at    timestamptz not null default now()
);

alter table public.interview_intake_invites enable row level security;

drop policy if exists intake_invites_read_office on public.interview_intake_invites;
create policy intake_invites_read_office on public.interview_intake_invites
  for select using (my_role() = 'office');

revoke all on table public.interview_intake_invites from anon;
revoke insert, update, delete on table public.interview_intake_invites from authenticated;
grant select on table public.interview_intake_invites to authenticated;

select 'OK: 0029 intake_invites' as result;
