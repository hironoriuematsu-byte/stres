-- ============================================================
-- 0009: 配布URL(campaigns)の操作をRPC化
--
-- 「new row violates row-level security policy for table "campaigns"」
-- への恒久対応。テーブルのRLSポリシー状態に依存しないよう、
-- 発行・再発行・停止/再開・取得を SECURITY DEFINER 関数に置き換える。
-- 権限チェックは関数内で行い、拒否時は実際のロール名をエラーに表示する。
-- ============================================================

-- 取得: office は全企業、それ以外は自社分のみ
create or replace function public.get_campaign(p_company uuid, p_year int)
returns setof public.campaigns
language sql stable security definer set search_path = public as
$$
  select * from campaigns
  where company_id = p_company and fiscal_year = p_year
    and (my_role() = 'office' or my_company() = p_company)
$$;

-- 発行(officeのみ)
create or replace function public.issue_campaign(p_company uuid, p_year int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role(), '(なし)') <> 'office' then
    raise exception '配布URLを発行できるのは実施者のみです(現在のロール: %)', coalesce(my_role(), '(なし)');
  end if;
  insert into campaigns (company_id, fiscal_year)
  values (p_company, p_year)
  on conflict (company_id, fiscal_year) do nothing;
end $$;

-- 再発行: トークンを新しくして配布中に戻す(officeのみ)
create or replace function public.rotate_campaign(p_campaign uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role(), '(なし)') <> 'office' then
    raise exception 'URLを再発行できるのは実施者のみです(現在のロール: %)', coalesce(my_role(), '(なし)');
  end if;
  update campaigns
  set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      active = true
  where id = p_campaign;
end $$;

-- 停止・再開(officeのみ)
create or replace function public.set_campaign_active(p_campaign uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role(), '(なし)') <> 'office' then
    raise exception '配布の停止・再開ができるのは実施者のみです(現在のロール: %)', coalesce(my_role(), '(なし)');
  end if;
  update campaigns set active = p_active where id = p_campaign;
end $$;

grant execute on function public.get_campaign(uuid, int) to authenticated;
grant execute on function public.issue_campaign(uuid, int) to authenticated;
grant execute on function public.rotate_campaign(uuid) to authenticated;
grant execute on function public.set_campaign_active(uuid, boolean) to authenticated;
