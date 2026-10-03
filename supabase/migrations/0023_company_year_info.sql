-- ============================================================
-- 0023: 在籍労働者数を年度ごとに保存する
--
-- 結果一覧と「検査結果等報告書(様式第6号の3)」で入力する在籍労働者数は、
-- これまで画面上の一時的な値で、画面を離れると消えていた。
-- 企業×年度ごとに保存し、どちらの画面からでも同じ値を使えるようにする。
--   - office: 全企業の値を読み書き
--   - jimu(誓約済み): 自社の値を読み書き
--   - 自社のメンバー: 読み取りのみ
--
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run。再実行しても問題ない
-- ============================================================

create table if not exists public.company_year_info (
  company_id  uuid not null references public.companies(id) on delete cascade,
  fiscal_year int  not null,
  headcount   int  check (headcount is null or headcount >= 0),  -- 在籍労働者数(検査実施年月の末日現在)
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id),
  primary key (company_id, fiscal_year)
);

alter table public.company_year_info enable row level security;

drop policy if exists "members read own-company year info" on public.company_year_info;
create policy "members read own-company year info" on public.company_year_info
  for select using (company_id = my_company() or my_role() = 'office');

drop policy if exists "office manages year info" on public.company_year_info;
create policy "office manages year info" on public.company_year_info
  for all using (my_role() = 'office') with check (my_role() = 'office');

drop policy if exists "jimu manages own-company year info" on public.company_year_info;
create policy "jimu manages own-company year info" on public.company_year_info
  for all using (my_role() = 'jimu' and company_id = my_company() and my_attested())
  with check (my_role() = 'jimu' and company_id = my_company() and my_attested());

grant select, insert, update on table public.company_year_info to authenticated;

-- 確認: テーブルがあること
select table_name from information_schema.tables where table_name = 'company_year_info';
