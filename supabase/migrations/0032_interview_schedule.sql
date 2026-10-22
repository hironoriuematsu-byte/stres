-- ============================================================
-- 0032: 面接指導の日程調整(候補日時の提示・本人の選択・オンライン面談のURL)
--   - 実施者(医師)が申出ごとに「オンラインで候補日時を出す」か「次回訪問時に対面で行う」かを選ぶ
--   - オンライン: 医師が空いている時間帯を入れると15分刻みの候補になり、本人がマイページで選ぶと確定する。
--     確定した面談には、その企業の「産業医面談ルーム(Google Meet)」のURLを付けて案内する
--   - 次回訪問: 訪問日を入れると本人と会社の担当者に案内する(時間は担当者が調整)
--   - 書き込みはサーバー(service_role)経由のみ。候補は本人と実施者だけが読める
-- 何度実行しても同じ結果になる
-- ============================================================

-- 企業ごとの産業医面談ルーム(Google Meet など)のURL。実施者が設定する
alter table public.companies add column if not exists meet_room_url text;

-- 申出の日程
alter table public.interview_requests add column if not exists schedule_mode text
  check (schedule_mode in ('online', 'visit'));                      -- online: オンライン面談 / visit: 次回訪問時に対面
alter table public.interview_requests add column if not exists slots_offered_at timestamptz; -- 候補日時を本人に出した日時
alter table public.interview_requests add column if not exists scheduled_at timestamptz;     -- 確定した面談の開始日時(次回訪問は訪問日の0時)
alter table public.interview_requests add column if not exists duration_min int;             -- 面談時間(分)
alter table public.interview_requests add column if not exists meet_url text;                -- オンライン面談のURL(確定時に付ける)
alter table public.interview_requests add column if not exists visit_note text;              -- 次回訪問: 時間帯などの補足
alter table public.interview_requests add column if not exists scheduled_by uuid references auth.users(id) on delete set null;

-- 候補日時(1行1候補)
create table if not exists public.interview_slots (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.interview_requests(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  starts_at     timestamptz not null,
  duration_min  int not null default 30,
  status        text not null default 'open' check (status in ('open', 'chosen', 'withdrawn')),
  created_at    timestamptz not null default now(),
  chosen_at     timestamptz,
  unique (request_id, starts_at)
);

create index if not exists idx_interview_slots_request on public.interview_slots (request_id, status);
create index if not exists idx_interview_slots_open on public.interview_slots (starts_at) where status = 'open';

alter table public.interview_slots enable row level security;

drop policy if exists interview_slots_read_own on public.interview_slots;
create policy interview_slots_read_own on public.interview_slots
  for select using (user_id = auth.uid());

drop policy if exists interview_slots_read_office on public.interview_slots;
create policy interview_slots_read_office on public.interview_slots
  for select using (my_role() = 'office');

revoke all on table public.interview_slots from anon;
revoke insert, update, delete on table public.interview_slots from authenticated;
grant select on table public.interview_slots to authenticated;

select 'OK: 0032 interview_schedule' as result;
