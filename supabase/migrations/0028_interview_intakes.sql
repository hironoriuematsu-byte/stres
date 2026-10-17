-- ============================================================
-- 0028: 面接指導の事前ヒアリング(AI)
--   高ストレス者が面接指導を申し出たあと、任意で AI が状況を聞き取り、
--   医師(実施者)向けの要約と、本人への返信の下書きを作る。返信は医師が確認してから送る。
--   - 対象: うえまつ産業医事務所が面接指導を行う企業(選任・顧問の企業、Web申込で「うえまつ産業医事務所に依頼」)
--   - 閲覧できるのは本人と実施者(office)だけ。会社の担当者(jimu・company)は見られない
--   - 書き込みはサーバー(service_role)経由のみ(画面から直接は書き換えられない)
-- 何度実行しても同じ結果になる
-- ============================================================

create table if not exists public.interview_intakes (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null unique references public.interview_requests(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  kind           text not null default 'high_stress'
                 check (kind in ('high_stress', 'overtime', 'return_to_work')), -- 将来: 長時間労働・復職
  status         text not null default 'in_progress'
                 check (status in ('in_progress', 'completed', 'abandoned')),
  consented_at   timestamptz not null default now(),       -- AIでの聞き取りへの本人の同意
  messages       jsonb not null default '[]'::jsonb,        -- [{role:"assistant"|"user", content, at}]
  risk_level     text not null default 'none'
                 check (risk_level in ('none', 'low', 'moderate', 'high')),
  urgent_notified_at timestamptz,                           -- 緊急度が高いと判断して実施者に知らせた時刻
  summary        jsonb,                                     -- 医師向けの要約(AI)
  reply_draft    text,                                      -- 本人への返信の下書き(AI)
  reply          text,                                      -- 医師が確認・送信した返信
  reply_sent_at  timestamptz,
  reply_sent_by  uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index if not exists idx_interview_intakes_user on public.interview_intakes (user_id);
create index if not exists idx_interview_intakes_company on public.interview_intakes (company_id);

alter table public.interview_intakes enable row level security;

drop policy if exists intake_read_own on public.interview_intakes;
create policy intake_read_own on public.interview_intakes
  for select using (user_id = auth.uid());

drop policy if exists intake_read_office on public.interview_intakes;
create policy intake_read_office on public.interview_intakes
  for select using (my_role() = 'office');

revoke all on table public.interview_intakes from anon;
revoke insert, update, delete on table public.interview_intakes from authenticated;
grant select on table public.interview_intakes to authenticated;

select 'OK: 0028 interview_intakes' as result;
