-- ============================================================
-- 0005: 受検用配布URL(キャンペーン)
--
-- 実施者(office)が企業×実施年度ごとに配布用トークンを発行し、
-- 従業員は /join/<token> から自己登録(メール確認による個人認証)で
-- アカウントを作成して受検する。
--   - office: 発行・再発行・停止(全企業)
--   - jimu / 従業員: 自社の配布情報の閲覧のみ
--   - 匿名ユーザー: campaign_info RPC でトークンから企業名・年度のみ取得可
-- ============================================================

create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  fiscal_year int  not null,
  token       text unique not null
              default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, fiscal_year)
);

alter table public.campaigns enable row level security;

drop policy if exists "office manages campaigns" on public.campaigns;
create policy "office manages campaigns" on public.campaigns
  for all using (my_role() = 'office') with check (my_role() = 'office');

drop policy if exists "members read own-company campaigns" on public.campaigns;
create policy "members read own-company campaigns" on public.campaigns
  for select using (company_id = my_company());

-- 匿名(登録前)がトークンから企業名・年度を確認するためのRPC。
-- トークン自体が秘密情報であり、返すのは企業名・年度・有効状態のみ。
create or replace function public.campaign_info(p_token text)
returns table(company_name text, fiscal_year int, active boolean)
language sql stable security definer set search_path = public as
$$
  select c.name, k.fiscal_year, k.active
  from campaigns k
  join companies c on c.id = k.company_id
  where k.token = p_token
$$;

grant execute on function public.campaign_info(text) to anon, authenticated;
