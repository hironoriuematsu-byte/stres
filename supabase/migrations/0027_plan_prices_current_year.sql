-- ============================================================
-- 0027: 今年度の料金も変更できるようにする(実施者のみ)
--   - 変更後のお申込みから新しい料金を使う
--   - 申込済みの企業は、申込時点の単価(plan_orders.unit_price)で記録済みのため変わらない
--     (その年度の人数の追加も、申込時点の単価で計算する)
--   - 前の年度以前の料金は変更できない
-- 何度実行しても同じ結果になる
-- ============================================================

create or replace function public.office_set_plan_price(p_year int, p_unit int, p_min int, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_current int := case when extract(month from jst_today()) >= 4
                        then extract(year from jst_today())::int
                        else extract(year from jst_today())::int - 1 end;
begin
  if coalesce(my_role(), '') <> 'office' then
    raise exception '料金を設定できるのは実施者のみです';
  end if;
  if p_year < v_current then
    raise exception '料金を変更できるのは今年度(%年度)以降です', v_current;
  end if;
  if p_unit is null or p_unit < 1 or p_unit > 100000 then
    raise exception '受検者1名あたりの料金を正しく入力してください';
  end if;
  if p_min is null or p_min < 0 or p_min > 1000000 then
    raise exception '最低料金を正しく入力してください';
  end if;
  insert into plan_prices (fiscal_year, unit_price, min_total, note, updated_at, updated_by)
  values (p_year, p_unit, p_min, nullif(trim(coalesce(p_note, '')), ''), now(), auth.uid())
  on conflict (fiscal_year) do update
    set unit_price = excluded.unit_price, min_total = excluded.min_total, note = excluded.note,
        updated_at = now(), updated_by = auth.uid();
  insert into access_logs (user_id, role, action, target)
  values (auth.uid(), 'office', 'set_plan_price', format('%s年度: 1名%s円・最低%s円', p_year, p_unit, p_min));
end $$;

grant execute on function public.office_set_plan_price(int, int, int, text) to authenticated;

select 'OK: 0027 plan_prices_current_year' as result;
