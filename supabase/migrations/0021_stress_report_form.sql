-- ============================================================
-- 0021: 心理的な負担の程度を把握するための検査結果等報告書(様式第6号の3)の記載項目
--
-- 労働基準監督署へ提出する報告書に転記できるよう、集団分析のページから
-- 記載項目を印刷・PDF表示する。
--   ・company_report_info: 事業場ごとの固定情報(事業の種類・所在地・電話・
--     事業者職氏名・労働保険番号・検査/面接指導を実施した者の区分)
--   ・stress_report_summary(p_company, p_year): 年度ごとの集計
--     (検査を受けた労働者数[実人数]、検査実施年月、面接指導を受けた労働者数、
--      集団ごとの分析の実施の有無)
--
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run。再実行しても問題ない
-- ============================================================

create table if not exists public.company_report_info (
  company_id uuid primary key references public.companies(id) on delete cascade,
  industry text,             -- 事業の種類(日本標準産業分類 中分類)
  postal_code text,          -- 郵便番号
  address text,              -- 事業場の所在地
  tel text,                  -- 電話
  representative text,       -- 事業者職氏名
  labor_insurance_no text,   -- 労働保険番号
  implementer_type smallint not null default 1 check (implementer_type in (1, 2, 3)),  -- 検査を実施した者
  interviewer_type smallint not null default 1 check (interviewer_type in (1, 2, 3)),  -- 面接指導を実施した医師
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.company_report_info enable row level security;

-- 実施者は全企業、実施事務従事者・事業者担当者は自社のみ
drop policy if exists "report_info_select" on public.company_report_info;
create policy "report_info_select" on public.company_report_info
  for select using (
    my_role() = 'office'
    or (my_role() in ('jimu', 'company') and company_id = my_company())
  );

drop policy if exists "report_info_insert" on public.company_report_info;
create policy "report_info_insert" on public.company_report_info
  for insert with check (
    my_role() = 'office'
    or (my_role() in ('jimu', 'company') and company_id = my_company())
  );

drop policy if exists "report_info_update" on public.company_report_info;
create policy "report_info_update" on public.company_report_info
  for update using (
    my_role() = 'office'
    or (my_role() in ('jimu', 'company') and company_id = my_company())
  );

grant select, insert, update on public.company_report_info to authenticated;


-- ------------------------------------------------------------
-- 年度ごとの集計(報告書の記入欄)
-- ------------------------------------------------------------
create or replace function public.stress_report_summary(p_company uuid, p_year int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_examined int;
  v_last timestamptz;
  v_interviewed int;
  v_done boolean;
begin
  if not (
    my_role() = 'office'
    or (my_role() in ('jimu', 'company') and p_company = my_company())
  ) then
    raise exception 'permission denied';
  end if;

  -- 検査を受けた労働者数: 実人数(同じ方が複数回受けても1名)
  select count(distinct user_id), max(created_at)
    into v_examined, v_last
    from results
   where company_id = p_company and fiscal_year = p_year;

  -- 面接指導を受けた労働者数: 申出のうち実施済み(done)になった方の実人数
  select count(distinct ir.user_id)
    into v_interviewed
    from interview_requests ir
    join results r on r.id = ir.result_id
   where ir.company_id = p_company
     and r.fiscal_year = p_year
     and ir.status = 'done';

  v_done := public.group_analysis_done(p_company, p_year);

  return jsonb_build_object(
    'examined', coalesce(v_examined, 0),
    'last_exam_at', v_last,
    'interviewed', coalesce(v_interviewed, 0),
    'group_analysis_done', coalesce(v_done, false)
  );
end $$;

grant execute on function public.stress_report_summary(uuid, int) to authenticated;


-- ------------------------------------------------------------
-- 適用状況の確認
-- ------------------------------------------------------------
select case when count(*) > 0 then '✅OK' else '❌未適用' end as 状態,
       'stress_report_summary(報告書の集計)' as 内容
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'stress_report_summary';
