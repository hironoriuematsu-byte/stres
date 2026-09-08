-- ============================================================
-- 0019: 集団ごとの分析の実施の有無を判定する関数
--
-- 労働基準監督署へ提出する「心理的な負担の程度を把握するための検査結果等
-- 報告書(様式第6号の2)」には「集団ごとの分析の実施の有無」の欄がある。
--
-- 本システムでは、集団分析報告書を開いた記録(access_logs の
-- view_group_report)をもって「実施あり」と判定する。
--
-- access_logs は実施者しか閲覧できないため、実施事務従事者からも
-- 判定できるように関数(SECURITY DEFINER)を用意する。
-- ============================================================

create or replace function public.group_analysis_done(p_company uuid, p_year int)
returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  -- 実施者は全企業、事務従事者・事業者担当者は自社のみ
  if not (
    my_role() = 'office'
    or (my_role() in ('jimu', 'company') and p_company = my_company())
  ) then
    raise exception 'permission denied';
  end if;

  return exists (
    select 1 from access_logs
     where company_id = p_company
       and action = 'view_group_report'
       and target like '%/' || p_year::text
  );
end $$;

grant execute on function public.group_analysis_done(uuid, int) to authenticated;


-- ------------------------------------------------------------
-- 適用状況の確認
-- ------------------------------------------------------------
select case when count(*) > 0 then '✅OK' else '❌未適用' end as 状態,
       'group_analysis_done(集団分析の実施の有無)' as 内容
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'group_analysis_done';
