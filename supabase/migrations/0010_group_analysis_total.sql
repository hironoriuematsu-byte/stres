-- ============================================================
-- 0010: 集団分析に「全体」行を追加
--
-- 各部署が10名未満でも、企業全体で10名以上いれば「全体」の
-- 集団分析を返すよう group_analysis を変更する。
-- (10名未満の部署を返さない基準は従来どおり)
-- ============================================================

create or replace function group_analysis(
  target_company uuid,
  target_year    int
)
returns table(
  dept text, n bigint, high_n bigint, high_rate numeric,
  avg_a numeric, avg_b numeric, avg_c numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  -- 権限: officeは全社、jimu/companyは自社のみ
  if not (
    my_role() = 'office'
    or (my_role() in ('jimu','company') and my_company() = target_company)
  ) then
    raise exception 'permission denied';
  end if;

  -- 部署別(10名以上のみ)
  return query
    select r.dept,
           count(*)::bigint,
           count(*) filter (where r.high_stress)::bigint,
           round(100.0 * count(*) filter (where r.high_stress) / count(*), 1),
           round(avg(r.score_a), 1),
           round(avg(r.score_b), 1),
           round(avg(r.score_c), 1)
    from results r
    where r.company_id = target_company
      and r.fiscal_year = target_year
    group by r.dept
    having count(*) >= 10;

  -- 全体(企業合計が10名以上のとき。部署がすべて10名未満でも表示される)
  return query
    select '全体'::text,
           count(*)::bigint,
           count(*) filter (where r.high_stress)::bigint,
           round(100.0 * count(*) filter (where r.high_stress) / count(*), 1),
           round(avg(r.score_a), 1),
           round(avg(r.score_b), 1),
           round(avg(r.score_c), 1)
    from results r
    where r.company_id = target_company
      and r.fiscal_year = target_year
    having count(*) >= 10;
end $$;
