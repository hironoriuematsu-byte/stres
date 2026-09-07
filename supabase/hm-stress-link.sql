-- ============================================================================
-- 健康管理Web ← ストレスチェックWeb の読み取り連携(本番用)
--
-- kenko-kanri リポジトリの supabase/migrations/0105_hm_stress_link_template.sql
-- のテンプレートを、ストレスチェックWebの実際の列名に合わせて完成させたもの。
--
-- 【実行の前提】
--   1. ストレスチェックWebの 0016_hm_link.sql を適用済みであること
--   2. 健康管理Webの 0101〜(hm_is_office / hm_my_role / hm_my_company /
--      hm_log_access)を適用済みであること
--
-- 【このSQLが行うこと】
--   健康管理Webから呼び出す読み取り専用の関数を3つ作成する。
--   ストレスチェックのテーブル(results / interview_requests / profiles)は
--   参照するだけで、変更は一切行わない。
--
-- 【監査】
--   健康管理Web側の hm_access_logs に加えて、ストレスチェックWebの
--   access_logs にも記録する。実施者はストレスチェックWebの「アクセスログ」
--   画面で、健康管理Web経由の閲覧も含めて追跡できる。
-- ============================================================================


-- ------------------------------------------------------------
-- 高ストレス者一覧(実施者のみ)
-- ------------------------------------------------------------
create or replace function public.hm_high_stress_list(
  p_company_id uuid,
  p_fiscal_year int
)
returns table (
  user_id uuid,
  full_name text,
  employee_no text,
  interview_requested boolean
)
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.hm_is_office() then
    raise exception 'permission denied: office only';
  end if;

  perform public.hm_log_access(
    'view_high_stress', 'results', null,
    jsonb_build_object('company_id', p_company_id, 'fiscal_year', p_fiscal_year)
  );
  -- ストレスチェックWeb側のアクセスログにも残す
  insert into public.access_logs(user_id, role, action, target, company_id)
  values (auth.uid(), public.my_role(), 'hm_view_high_stress', p_fiscal_year::text || '年度', p_company_id);

  return query
    select
      r.user_id,
      p.name    as full_name,
      p.emp_id  as employee_no,
      exists (
        select 1 from public.interview_requests ir where ir.result_id = r.id
      ) as interview_requested
    from public.results r
    join public.profiles p on p.user_id = r.user_id
    where r.company_id = p_company_id
      and r.fiscal_year = p_fiscal_year
      and r.high_stress = true
    order by p.emp_id nulls last, p.name;
end;
$$;


-- ------------------------------------------------------------
-- 集団サマリー(実施者 / 企業は自社のみ)。10名未満は人数・率を返さない
-- ------------------------------------------------------------
create or replace function public.hm_stress_summary(
  p_company_id uuid,
  p_fiscal_year int
)
returns table (
  total int,
  high_stress int,
  high_stress_rate numeric
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_total int;
  v_high int;
begin
  if not (
    public.hm_is_office()
    or (public.hm_my_role() in ('company', 'jimu') and p_company_id = public.hm_my_company())
  ) then
    raise exception 'permission denied';
  end if;

  select count(*), count(*) filter (where r.high_stress)
    into v_total, v_high
    from public.results r
   where r.company_id = p_company_id
     and r.fiscal_year = p_fiscal_year;

  -- 個人が特定されないよう、10名未満は人数・率を返さない
  return query select
    v_total,
    case when v_total >= 10 then v_high else null end,
    case when v_total >= 10 then round(v_high::numeric * 100 / v_total, 1) else null end;
end;
$$;


-- ------------------------------------------------------------
-- 個人のストレスチェック歴(実施者のみ)
-- ------------------------------------------------------------
create or replace function public.hm_stress_history(p_user_id uuid)
returns table (
  fiscal_year int,
  is_high_stress boolean,
  interview_requested boolean
)
language plpgsql security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if not public.hm_is_office() then
    raise exception 'permission denied: office only';
  end if;

  select company_id into v_company from public.profiles where user_id = p_user_id;

  perform public.hm_log_access('view_stress_history', 'results', p_user_id, null);
  insert into public.access_logs(user_id, role, action, target, company_id)
  values (auth.uid(), public.my_role(), 'hm_view_stress_history', p_user_id::text, v_company);

  return query
    select
      r.fiscal_year,
      r.high_stress as is_high_stress,
      exists (
        select 1 from public.interview_requests ir where ir.result_id = r.id
      ) as interview_requested
    from public.results r
    where r.user_id = p_user_id
    order by r.fiscal_year desc;
end;
$$;


grant execute on function public.hm_high_stress_list(uuid, int) to authenticated;
grant execute on function public.hm_stress_summary(uuid, int) to authenticated;
grant execute on function public.hm_stress_history(uuid) to authenticated;


-- ------------------------------------------------------------
-- 動作確認(実施者アカウントでSQL Editorから実行した場合の想定)
--   ※ SQL Editor は認証されたユーザーとしては実行されないため、
--      ここでは関数が作成できたことのみを確認する
-- ------------------------------------------------------------
select * from (
  values
    ('hm_high_stress_list(高ストレス者一覧)',
     (select case when count(*) > 0 then '✅作成済' else '❌未作成' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hm_high_stress_list')),
    ('hm_stress_summary(集団サマリー)',
     (select case when count(*) > 0 then '✅作成済' else '❌未作成' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hm_stress_summary')),
    ('hm_stress_history(個人の受検歴)',
     (select case when count(*) > 0 then '✅作成済' else '❌未作成' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'hm_stress_history'))
) as t(関数, 状態);
