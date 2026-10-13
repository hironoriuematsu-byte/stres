-- ============================================================
-- 0026: Web申込の料金を年度ごとに設定できるようにする
--   - plan_prices: 年度ごとの料金(受検者1名あたり・最低料金。税込・円)
--     その年度の行がなければ、それより前で最も新しい年度の料金を使う
--   - 料金は宣伝ページ・特商法の表示にも使うため、誰でも読める(書き換えは実施者のみ、RPC経由)
--   - 変更できるのは「次の年度以降」だけ(今年度の料金は、申込済みの企業との公平のため変えない)
--   - plan_orders: 申込時点の単価と受検人数枠を記録する(料金を改定しても過去の申込は変わらない)
-- 何度実行しても同じ結果になる
-- ============================================================

create table if not exists public.plan_prices (
  fiscal_year int primary key check (fiscal_year between 2020 and 2100),
  unit_price  int not null check (unit_price between 1 and 100000),
  min_total   int not null check (min_total between 0 and 1000000),
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.plan_prices enable row level security;
drop policy if exists plan_prices_read on public.plan_prices;
create policy plan_prices_read on public.plan_prices for select using (true);
grant select on public.plan_prices to anon, authenticated;

-- 現在の料金(2026年度〜)
insert into public.plan_prices (fiscal_year, unit_price, min_total, note)
values (2026, 330, 3300, '開始時の料金')
on conflict (fiscal_year) do nothing;

alter table public.plan_orders add column if not exists unit_price int;
alter table public.plan_orders add column if not exists seats_granted int;

-- 料金の設定(実施者のみ)。次の年度以降だけ
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
  if p_year <= v_current then
    raise exception '料金を変更できるのは次の年度(%年度)以降です', v_current + 1;
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

-- 設定の取り消し(実施者のみ)。次の年度以降だけ(前の年度の料金が引き続き使われる)
create or replace function public.office_delete_plan_price(p_year int)
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
  if p_year <= v_current then
    raise exception '今年度以前の料金は取り消せません';
  end if;
  delete from plan_prices where fiscal_year = p_year;
  insert into access_logs (user_id, role, action, target)
  values (auth.uid(), 'office', 'delete_plan_price', format('%s年度の料金設定を取り消し', p_year));
end $$;

grant execute on function public.office_delete_plan_price(int) to authenticated;

select 'OK: 0026 plan_prices' as result;
