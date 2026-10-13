-- ============================================================
-- 0025: Web申込(顧問契約のない企業向けのクレジットカード決済プラン)
--
-- 宣伝ページ(/plan)から企業が受検予定人数・受検期間を入れて申し込み、
-- クレジットカード(Stripe)で支払うと、企業・受検期間・人数枠・配布URLが自動で作られ、
-- 担当者(実施事務従事者)に招待メールが届く。
--
--   plan_orders : 申込と支払いの記録(新規申込 / 人数の追加購入)。書き込みはサーバー(service_role)のみ
--   exam_plans  : 企業×年度の受検期間と人数枠。行がある企業だけ、期間外・人数超過の受検を止める
--                 (これまでの契約企業には行が無いので、従来どおり制限なし)
--
-- 権限:
--   - office: すべて閲覧。受検期間・人数枠の手動変更(office_update_exam_plan)
--   - jimu  : 自社の申込・受検期間を閲覧。締切日の変更(set_exam_end。開始から3か月・年度末までの範囲)
--   - 自社のメンバー: 受検期間・受検者数の確認(exam_plan_status)
--
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run。再実行しても問題ない。
-- 既存の企業・受検には影響しない(exam_plans に行がある企業だけが対象)。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 申込・支払いの記録
-- ------------------------------------------------------------
create table if not exists public.plan_orders (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null check (kind in ('new', 'add_seats', 'renew')), -- renew: 次年度以降の継続申込
  status                text not null default 'pending'
                        check (status in ('pending', 'paid', 'provisioned', 'failed', 'expired')),
  company_id            uuid references public.companies(id) on delete set null, -- 新規申込は開設後に入る
  fiscal_year           int  not null,
  seats                 int  not null check (seats between 1 and 10000),        -- 購入人数
  amount                int  not null check (amount >= 0),                       -- 支払額(税込・円)
  company_name          text not null,
  office_name           text,                                                    -- 事業場名
  address               text,
  contact_name          text not null,
  contact_email         text not null,
  contact_phone         text,
  workers               int  check (workers is null or workers >= 0),            -- 事業場の労働者数
  questionnaire         text not null default '57' check (questionnaire in ('57', '80')),
  exam_start            date,
  exam_end              date,
  interview_option      text check (interview_option in ('own', 'mestate', 'sanpo')),
  stripe_session_id     text unique,
  stripe_payment_intent text,
  error                 text,                                                    -- 開設処理で起きた問題(実施者が確認)
  created_at            timestamptz not null default now(),
  paid_at               timestamptz,
  provisioned_at        timestamptz
);

-- 継続申込(renew)を加える(以前の版を実行済みの場合に備えて、制約を作り直す)
alter table public.plan_orders drop constraint if exists plan_orders_kind_check;
alter table public.plan_orders add constraint plan_orders_kind_check check (kind in ('new', 'add_seats', 'renew'));

-- 領収書(Stripe の請求書・領収書)を後から取り出すための請求書ID
alter table public.plan_orders add column if not exists stripe_invoice_id text;

create index if not exists idx_plan_orders_created on public.plan_orders(created_at desc);
create index if not exists idx_plan_orders_company on public.plan_orders(company_id);

alter table public.plan_orders enable row level security;

drop policy if exists "office reads plan orders" on public.plan_orders;
create policy "office reads plan orders" on public.plan_orders
  for select using (my_role() = 'office');

drop policy if exists "jimu reads own-company plan orders" on public.plan_orders;
create policy "jimu reads own-company plan orders" on public.plan_orders
  for select using (my_role() = 'jimu' and company_id = my_company());

-- 書き込みは決済の確認を経たサーバー処理(service_role)だけが行う
revoke all on table public.plan_orders from anon;
revoke insert, update, delete on table public.plan_orders from authenticated;
grant select on table public.plan_orders to authenticated;

-- ------------------------------------------------------------
-- 2. 受検期間と人数枠(企業×年度)
-- ------------------------------------------------------------
create table if not exists public.exam_plans (
  company_id       uuid not null references public.companies(id) on delete cascade,
  fiscal_year      int  not null,
  seats            int  not null check (seats >= 0),   -- 購入済みの人数(追加購入で増える)
  exam_start       date not null,
  exam_end         date not null,                      -- 締切日(この日まで受検できる)
  max_end          date not null,                      -- 締切を延ばせる最終日(開始から3か月・年度末まで)
  interview_option text check (interview_option in ('own', 'mestate', 'sanpo')),
  workers          int  check (workers is null or workers >= 0),
  updated_at       timestamptz not null default now(),
  primary key (company_id, fiscal_year),
  constraint exam_plan_period check (exam_start <= exam_end and exam_end <= max_end)
);

alter table public.exam_plans enable row level security;

drop policy if exists "members read own-company exam plan" on public.exam_plans;
create policy "members read own-company exam plan" on public.exam_plans
  for select using (company_id = my_company() or my_role() = 'office');

-- 人数枠の8割・満員のお知らせメールを送ったときの人数枠(人数を追加すると枠が変わり、再び送れる)
alter table public.exam_plans add column if not exists alert80_seats int;
alter table public.exam_plans add column if not exists alert_full_seats int;

revoke all on table public.exam_plans from anon;
revoke insert, update, delete on table public.exam_plans from authenticated;
grant select on table public.exam_plans to authenticated;

-- 日本時間の「今日」
create or replace function public.jst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

-- 受検期間・受検者数の確認(自社のメンバーと office)。
-- 受検者数は results の件数だけを返す(誰が受検したかは返さない)
create or replace function public.exam_plan_status(p_company uuid, p_year int)
returns table(seats int, used int, exam_start date, exam_end date, max_end date, interview_option text, workers int)
language sql stable security definer set search_path = public as
$$
  select p.seats,
         (select count(*)::int from results r where r.company_id = p.company_id and r.fiscal_year = p.fiscal_year),
         p.exam_start, p.exam_end, p.max_end, p.interview_option, p.workers
    from exam_plans p
   where p.company_id = p_company and p.fiscal_year = p_year
     and (my_role() = 'office' or my_company() = p_company)
$$;

-- 締切日の変更(自社の実施事務従事者・office)。開始日〜延長できる最終日の範囲で変更できる
create or replace function public.set_exam_end(p_company uuid, p_year int, p_end date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_plan exam_plans;
begin
  if not (my_role() = 'office' or (my_role() = 'jimu' and my_company() = p_company)) then
    raise exception '締切日を変更できるのは、自社の実施事務従事者または実施者のみです';
  end if;
  select * into v_plan from exam_plans where company_id = p_company and fiscal_year = p_year;
  if not found then
    raise exception 'この企業・年度の受検期間が登録されていません';
  end if;
  if p_end < v_plan.exam_start or p_end > v_plan.max_end then
    raise exception '締切日は %〜% の範囲で指定してください', v_plan.exam_start, v_plan.max_end;
  end if;
  update exam_plans set exam_end = p_end, updated_at = now()
   where company_id = p_company and fiscal_year = p_year;
  insert into access_logs (user_id, role, action, target, company_id)
  values (auth.uid(), my_role(), 'set_exam_end', p_year || '年度 締切 ' || p_end, p_company);
end $$;

-- 実施者による手動変更(返金・特別対応・人数の付け替えなど)
create or replace function public.office_update_exam_plan(
  p_company uuid, p_year int, p_seats int, p_start date, p_end date, p_max_end date
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role(), '') <> 'office' then
    raise exception '受検期間・人数枠を直接変更できるのは実施者のみです';
  end if;
  update exam_plans
     set seats = p_seats, exam_start = p_start, exam_end = p_end, max_end = greatest(p_max_end, p_end),
         updated_at = now()
   where company_id = p_company and fiscal_year = p_year;
  if not found then
    raise exception 'この企業・年度の受検期間が登録されていません';
  end if;
  insert into access_logs (user_id, role, action, target, company_id)
  values (auth.uid(), 'office', 'update_exam_plan',
          p_year || '年度 ' || p_seats || '名 ' || p_start || '〜' || p_end, p_company);
end $$;

grant execute on function public.jst_today() to authenticated;
grant execute on function public.exam_plan_status(uuid, int) to authenticated;
grant execute on function public.set_exam_end(uuid, int, date) to authenticated;
grant execute on function public.office_update_exam_plan(uuid, int, int, date, date, date) to authenticated;

-- ------------------------------------------------------------
-- 3. 受検の制限(Web申込の企業のみ): 受検期間外・人数枠超過の受検を登録しない
-- ------------------------------------------------------------
create or replace function public.enforce_exam_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_plan  exam_plans;
  v_used  int;
  v_today date := jst_today();
begin
  select * into v_plan from exam_plans where company_id = new.company_id and fiscal_year = new.fiscal_year;
  if not found then
    -- Web申込の企業で、この年度の申込がない(例: 来年度の申込で、今年度のうちに受検しようとした)
    if exists (select 1 from exam_plans p where p.company_id = new.company_id) then
      raise exception '現在は受検期間ではありません。受検期間は会社の担当者にご確認ください'
        using errcode = 'P0001', hint = 'exam_plan_none';
    end if;
    return new; -- これまでの契約企業(受検期間の登録なし)は制限しない
  end if;
  if v_today < v_plan.exam_start then
    raise exception '受検期間は % からです。期間になってから受検してください', v_plan.exam_start
      using errcode = 'P0001', hint = 'exam_plan_before';
  end if;
  if v_today > v_plan.exam_end then
    raise exception '受検期間(% まで)は終了しました。受検が必要な場合は会社の担当者にご連絡ください', v_plan.exam_end
      using errcode = 'P0001', hint = 'exam_plan_closed';
  end if;
  -- 同時に送信されても人数枠を超えないよう、企業×年度ごとに順番に処理する
  perform pg_advisory_xact_lock(hashtext(new.company_id::text || ':' || new.fiscal_year::text));
  select count(*) into v_used from results where company_id = new.company_id and fiscal_year = new.fiscal_year;
  if v_used >= v_plan.seats then
    raise exception 'お申込みの人数(% 名)に達したため受検できません。会社の担当者に人数の追加をご依頼ください', v_plan.seats
      using errcode = 'P0001', hint = 'exam_plan_full';
  end if;
  return new;
end $$;

drop trigger if exists enforce_exam_plan on public.results;
create trigger enforce_exam_plan before insert on public.results
  for each row execute function public.enforce_exam_plan();

-- ------------------------------------------------------------
-- 4. 支払い完了後の開設処理(Webhook から service_role で呼ぶ)
--    1つのトランザクションで「支払い済み → 企業・受検期間・配布URLの作成(追加購入は人数の加算)→ 開設済み」
--    まで行う。Stripe から同じ通知が再送されても二重に作らない(開設済みなら何もしない)
-- ------------------------------------------------------------
create or replace function public.provision_plan_order(
  p_order uuid, p_payment_intent text, p_seats_granted int, p_max_end date
) returns table(company_id uuid, company_code text, already boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_order   plan_orders;
  v_company uuid;
  v_code    text;
begin
  select * into v_order from plan_orders where id = p_order for update;
  if not found then
    raise exception '申込が見つかりません: %', p_order;
  end if;
  if v_order.status = 'provisioned' then
    return query select v_order.company_id, (select c.code from companies c where c.id = v_order.company_id), true;
    return;
  end if;

  if v_order.kind in ('new', 'renew') then  -- renew は既存の企業(company_id 指定済み)に新しい年度を追加する
    v_company := v_order.company_id;
    if v_company is null then
      -- 企業コード: W + 申込日(YYMMDD) + 英数字3文字(重複しないものを選ぶ)
      loop
        v_code := 'W' || to_char(jst_today(), 'YYMMDD') || upper(substr(md5(random()::text), 1, 3));
        exit when not exists (select 1 from companies c where c.code = v_code);
      end loop;
      insert into companies (name, code, questionnaire)
      values (v_order.company_name, v_code, v_order.questionnaire)
      returning id into v_company;
    else
      select c.code into v_code from companies c where c.id = v_company;
    end if;

    insert into exam_plans (company_id, fiscal_year, seats, exam_start, exam_end, max_end, interview_option, workers)
    values (v_company, v_order.fiscal_year, p_seats_granted, v_order.exam_start, v_order.exam_end,
            greatest(p_max_end, v_order.exam_end), v_order.interview_option, v_order.workers)
    on conflict on constraint exam_plans_pkey do nothing;

    insert into campaigns (company_id, fiscal_year) values (v_company, v_order.fiscal_year)
    on conflict (company_id, fiscal_year) do nothing;
  else
    -- 人数の追加購入
    v_company := v_order.company_id;
    update exam_plans set seats = seats + v_order.seats, updated_at = now()
     where exam_plans.company_id = v_company and fiscal_year = v_order.fiscal_year;
    if not found then
      raise exception '追加購入の対象の受検期間がありません(企業 %, % 年度)', v_company, v_order.fiscal_year;
    end if;
    select c.code into v_code from companies c where c.id = v_company;
  end if;

  update plan_orders
     set status = 'provisioned', company_id = v_company,
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         paid_at = coalesce(paid_at, now()), provisioned_at = now(), error = null
   where id = p_order;

  return query select v_company, v_code, false;
end $$;

revoke all on function public.provision_plan_order(uuid, text, int, date) from public, anon, authenticated;
grant execute on function public.provision_plan_order(uuid, text, int, date) to service_role;

-- ------------------------------------------------------------
-- 確認: すべて ✅ なら完了
-- ------------------------------------------------------------
select * from (
  values
    ('plan_orders テーブル', (select case when to_regclass('public.plan_orders') is not null then '✅OK' else '❌' end)),
    ('exam_plans テーブル',  (select case when to_regclass('public.exam_plans') is not null then '✅OK' else '❌' end)),
    ('受検の制限(トリガー)',
     (select case when count(*) = 1 then '✅OK' else '❌' end
        from pg_trigger where tgname = 'enforce_exam_plan' and not tgisinternal))
) as t(項目, 状態);
