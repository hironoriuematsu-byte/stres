-- ============================================================
-- 0014: 部署マスタ(部署名の選択肢)
--
-- 従業員の自由入力による部署名の表記ゆれを防ぐため、企業ごとに
-- 部署名をあらかじめ登録し、受検時・修正時に選択できるようにする。
-- (一覧にない部署は従来どおり直接入力もできる)
--   - office: 全企業の部署を管理
--   - jimu(誓約済み): 自社の部署を管理
--   - 自社のメンバー(従業員含む): 選択肢として閲覧のみ
-- ============================================================

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists departments_company_idx on public.departments (company_id);

alter table public.departments enable row level security;

-- 自社のメンバー(従業員・事務従事者)と実施者は選択肢として読める
drop policy if exists "members read own-company departments" on public.departments;
create policy "members read own-company departments" on public.departments
  for select using (company_id = my_company() or my_role() = 'office');

-- 実施者は全企業の部署を管理できる
drop policy if exists "office manages departments" on public.departments;
create policy "office manages departments" on public.departments
  for all using (my_role() = 'office') with check (my_role() = 'office');

-- 誓約済みの実施事務従事者は自社の部署を管理できる
drop policy if exists "jimu manages own-company departments" on public.departments;
create policy "jimu manages own-company departments" on public.departments
  for all using (my_role() = 'jimu' and company_id = my_company() and my_attested())
  with check (my_role() = 'jimu' and company_id = my_company() and my_attested());

grant select, insert, update, delete on table public.departments to authenticated;
