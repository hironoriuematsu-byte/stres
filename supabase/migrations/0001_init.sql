-- ============================================================
-- ストレスチェックシステム: 初期スキーマ + RLS
-- Supabase SQL Editor でこのファイルを実行してください。
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles: auth.users を拡張し、ロール(employee/office/company_hr)を保持
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'employee' check (role in ('employee', 'office', 'company_hr')),
  full_name text,
  department text,
  employee_no text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- 自分自身のロールを昇格させることを防ぐ(office/company_hr の付与は管理者がSQLで実施)
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role <> old.role and auth.uid() = old.id then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_self_escalation on public.profiles;
create trigger trg_prevent_role_self_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_role_self_escalation();

-- 新規サインアップ時に自動でプロフィール行を作成(常に role='employee')
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (new.id, 'employee', new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ------------------------------------------------------------
-- results: ストレスチェック回答結果
-- ------------------------------------------------------------
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  employee_no text not null,
  department text not null default '未記入',
  taken_at timestamptz not null default now(),
  score_a int not null,
  score_b int not null,
  score_c int not null,
  score_d int not null,
  score_ac int not null,
  high_stress boolean not null,
  consent_to_company boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_results_user_id on public.results (user_id);
create index if not exists idx_results_department on public.results (department);

alter table public.results enable row level security;

-- 本人は自分の結果を登録・閲覧できる
create policy "results_insert_own"
  on public.results for insert
  with check (auth.uid() = user_id);

create policy "results_select_own"
  on public.results for select
  using (auth.uid() = user_id);

-- 産業医事務所(office)は全件閲覧可能
create policy "results_select_office"
  on public.results for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'office'
    )
  );

-- 企業人事(company_hr)は本人同意済みの個人結果のみ閲覧可能(労働安全衛生法第66条の10)
create policy "results_select_company_consented"
  on public.results for select
  using (
    consent_to_company = true
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'company_hr'
    )
  );

-- 更新・削除は不可(結果は不変記録として扱う)

-- ------------------------------------------------------------
-- 部署別集団分析: 同意の有無に関わらず集計値のみを返す(個人特定不可)
-- office / company_hr のみ実行可能。SECURITY DEFINER でRLSを内部的にバイパスするが、
-- 呼び出し元のロールを関数内で必ず検証する。
-- ------------------------------------------------------------
create or replace function public.get_department_stats()
returns table (department text, n bigint, high_count bigint, avg_b numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('company_hr', 'office')
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select r.department, count(*)::bigint, count(*) filter (where r.high_stress)::bigint, avg(r.score_b)
    from public.results r
    group by r.department;
end;
$$;

grant execute on function public.get_department_stats() to authenticated;

-- ------------------------------------------------------------
-- 管理者向けメモ: office / company_hr ロールの付与方法
-- 1. Supabase Dashboard > Authentication > Users で該当ユーザーを招待/作成
-- 2. SQL Editor で以下を実行してロールを付与
--    update public.profiles set role = 'office' where id = '<user-uuid>';
--    update public.profiles set role = 'company_hr' where id = '<user-uuid>';
-- ------------------------------------------------------------
