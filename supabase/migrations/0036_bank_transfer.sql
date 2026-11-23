-- ============================================================
-- 0036_bank_transfer.sql : Web申込のお支払いに、銀行振込を加える
-- ============================================================
-- 銀行振込は、決済代行会社(Stripe)が会社ごとに振込先の口座(バーチャル口座)を用意し、
-- 入金を自動で照合する。入金が確認されるまで、お申込みは「お振込み待ち」になる。
--
--   ・companies.stripe_customer_id : 会社ごとの Stripe の顧客ID(振込先の口座は、この顧客ごとに決まる)
--   ・plan_orders.pay_method       : お支払い方法(card / bank_transfer)。お振込み待ちの申込は bank_transfer
--   ・plan_orders.pay_due          : お振込みの期限(この日を過ぎても入金がなければ、申込を取り消す)
--   ・plan_orders.pay_url          : 振込先を表示する Stripe のページ
--   ・plan_orders.pay_info         : 振込先(銀行名・支店名・口座番号・口座名義)と、残りの金額
--   ・plan_orders.pay_reminded_at  : 期限が近いことをお知らせした日時
--   ・plan_orders.pay_short_at     : 入金額の不足をお知らせした日時
--
-- 実行しただけでは、画面も決済も変わらない(Vercel の環境変数 NEXT_PUBLIC_BANK_TRANSFER=1 を入れてから有効になる)。
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run。再実行しても問題ない
-- ============================================================

alter table public.companies add column if not exists stripe_customer_id text;

alter table public.plan_orders add column if not exists pay_method text;
alter table public.plan_orders add column if not exists pay_due date;
alter table public.plan_orders add column if not exists pay_url text;
alter table public.plan_orders add column if not exists pay_info jsonb;
alter table public.plan_orders add column if not exists pay_reminded_at timestamptz;
alter table public.plan_orders add column if not exists pay_short_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_orders_pay_method_check') then
    alter table public.plan_orders
      add constraint plan_orders_pay_method_check check (pay_method is null or pay_method in ('card', 'bank_transfer'));
  end if;
end $$;

-- お振込み待ちの申込を探しやすくする
create index if not exists idx_plan_orders_awaiting
  on public.plan_orders (pay_due) where status = 'pending' and pay_method = 'bank_transfer';

-- 適用状況
select 項目, 状態 from (
  select 1 as ord, '会社ごとの顧客ID(companies.stripe_customer_id)' as 項目,
         (select case when count(*) > 0 then '✅OK' else '❌未適用' end from information_schema.columns
           where table_schema = 'public' and table_name = 'companies' and column_name = 'stripe_customer_id') as 状態
  union all
  select 2, 'お振込み待ちの記録(plan_orders の pay_ で始まる列)',
         (select case when count(*) = 6 then '✅OK' else '❌未適用(' || count(*) || '/6)' end from information_schema.columns
           where table_schema = 'public' and table_name = 'plan_orders'
             and column_name in ('pay_method', 'pay_due', 'pay_url', 'pay_info', 'pay_reminded_at', 'pay_short_at'))
  union all
  select 3, 'いまお振込み待ちの申込',
         (select count(*)::text || '件' from public.plan_orders where status = 'pending' and pay_method = 'bank_transfer')
) t
order by ord;
