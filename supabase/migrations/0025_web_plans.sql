-- ============================================================
-- 0025: Web申込(顧問契約のない企業向けのクレジットカード決済プラン)
--
-- 「会社を先に登録 → ログイン後の画面で年度ごとに申し込む」方式。
--   1) 宣伝ページ(/plan)から会社(事業場)と担当者を登録する(メール確認)。同じ会社の二重登録は、
--      メールアドレスと「登録番号(インボイス)または法人番号 + 事業場名」で見分けて止める
--   2) 担当者がログイン後の画面で「今年度を申し込む」→ クレジットカード(Stripe)で支払うと、
--      その年度の受検期間・人数枠・配布URLが作られる。2年目以降もまったく同じ操作
--   3) 更新の時期(前年の受検開始日の約1か月半前・2週間前)に担当者へ案内メールを送る
--
--   companies.web_signup : Web申込で登録した企業(受検期間・人数枠の範囲でのみ受検できる)
--   plan_orders : 申込と支払いの記録(初年度 / 継続 / 人数の追加購入)。書き込みはサーバー(service_role)のみ
--   exam_plans  : 企業×年度の受検期間と人数枠
--   plan_reminders : 更新の案内メールの送信記録
--   (これまでの契約企業は web_signup = false で受検期間の登録も無いので、従来どおり制限なし)
--
-- 権限:
--   - office: すべて閲覧。受検期間・人数枠の手動変更(office_update_exam_plan)
--   - jimu  : 自社の申込・受検期間を閲覧。締切日の変更(set_exam_end。開始から3か月・年度末までの範囲)
--   - 自社のメンバー: 受検期間・受検者数の確認(exam_plan_status)
--
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run。再実行しても問題ない。
-- 既存の企業・受検には影響しない(Web申込で登録した企業だけが対象)。
-- ============================================================

-- ------------------------------------------------------------
-- 0. Web申込で登録した企業の情報
-- ------------------------------------------------------------
alter table public.companies add column if not exists web_signup boolean not null default false;
alter table public.companies add column if not exists biz_id text;        -- 登録番号(インボイス)または法人番号の13桁(先頭のTは除く)
alter table public.companies add column if not exists office_name text;   -- 事業場名
alter table public.companies add column if not exists office_key text;    -- 事業場名を比較用にそろえたもの(空白・表記ゆれを除く)
alter table public.companies add column if not exists address text;
alter table public.companies add column if not exists workers int;
alter table public.companies add column if not exists contact_phone text;
-- 同じ番号・同じ事業場の二重登録を防ぐ(番号が同じでも事業場が違えば別に登録できる)
create unique index if not exists uq_companies_web_biz_office
  on public.companies (biz_id, coalesce(office_key, ''))
  where web_signup and biz_id is not null;

-- ------------------------------------------------------------
-- 1. 申込・支払いの記録
-- ------------------------------------------------------------
create table if not exists public.plan_orders (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null check (kind in ('new', 'add_seats', 'renew')), -- new: 初年度 / renew: 2年目以降 / add_seats: 人数の追加
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
  -- 制限するのは、Web申込(カード決済)で利用中の企業だけ。
  -- 選任・顧問契約の企業、Web申込から顧問契約に切り替えた企業(web_signup = false)は制限しない
  if not exists (select 1 from companies c where c.id = new.company_id and c.web_signup) then
    return new;
  end if;
  select * into v_plan from exam_plans where company_id = new.company_id and fiscal_year = new.fiscal_year;
  if not found then
    -- この年度の申込がない(申込前・来年度の申込で今年度のうちに受検しようとした など)
    raise exception '現在は受検期間ではありません。受検期間は会社の担当者にご確認ください'
      using errcode = 'P0001', hint = 'exam_plan_none';
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

  if v_order.kind in ('new', 'renew') then
    -- 企業は会社登録の時点で作られている(年度の申込は必ず登録済みの企業に対して行う)
    v_company := v_order.company_id;
    if v_company is null then
      raise exception '申込に企業が指定されていません: %', p_order;
    end if;
    select c.code into v_code from companies c where c.id = v_company;

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
-- 5. 更新の案内メールの送信記録(同じ案内を二重に送らない)
-- ------------------------------------------------------------
create table if not exists public.plan_reminders (
  company_id  uuid not null references public.companies(id) on delete cascade,
  fiscal_year int  not null,                 -- 案内する年度
  kind        text not null check (kind in ('45d', '14d')),
  sent_at     timestamptz not null default now(),
  primary key (company_id, fiscal_year, kind)
);
alter table public.plan_reminders enable row level security;
revoke all on table public.plan_reminders from anon, authenticated;

-- ------------------------------------------------------------
-- 5-2. 顧問契約への切り替え(実施者のみ)
--    Web申込の企業が顧問契約(選任)になったら web_signup を外す。以降は受検期間・人数枠の制限も
--    年度の申込(支払い)も無く、これまでの契約企業と同じく無料で使える。
--    企業・担当者・従業員・過去の結果・支払いの記録はそのまま残る。契約が終わったら Web申込に戻せる
-- ------------------------------------------------------------
create or replace function public.office_set_web_signup(p_company uuid, p_web boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(my_role(), '') <> 'office' then
    raise exception '契約の切り替えができるのは実施者のみです';
  end if;
  update companies set web_signup = p_web where id = p_company;
  if not found then
    raise exception '企業が見つかりません';
  end if;
  insert into access_logs (user_id, role, action, target, company_id)
  values (auth.uid(), 'office', 'set_web_signup',
          case when p_web then 'Web申込(カード決済)に切り替え' else '顧問契約(無料・制限なし)に切り替え' end, p_company);
end $$;

grant execute on function public.office_set_web_signup(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 5-3. Web申込の企業の一覧(実施者のみ): 年度ごとの状況・受検者数・支払いの合計などを1回で取得する
--      (Web申込から顧問契約に切り替えた企業も、支払いの記録があれば一覧に含める)
-- ------------------------------------------------------------
create or replace function public.office_web_companies(p_year int)
returns table(
  company_id uuid, name text, code text, office_name text, biz_id text, address text, workers int,
  web_signup boolean, created_at timestamptz, jimu_names text,
  seats int, used int, exam_start date, exam_end date,
  orders int, paid_total int, last_paid_at timestamptz, last_year int
)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.code, c.office_name, c.biz_id, c.address, c.workers, c.web_signup, c.created_at,
         (select string_agg(p.name, '、' order by p.created_at) from profiles p where p.company_id = c.id and p.role = 'jimu'),
         ep.seats,
         (select count(*)::int from results r where r.company_id = c.id and r.fiscal_year = p_year),
         ep.exam_start, ep.exam_end,
         (select count(*)::int from plan_orders o where o.company_id = c.id and o.status in ('paid', 'provisioned')),
         (select coalesce(sum(o.amount), 0)::int from plan_orders o where o.company_id = c.id and o.status in ('paid', 'provisioned')),
         (select max(o.paid_at) from plan_orders o where o.company_id = c.id and o.status in ('paid', 'provisioned')),
         (select max(e.fiscal_year) from exam_plans e where e.company_id = c.id)
    from companies c
    left join exam_plans ep on ep.company_id = c.id and ep.fiscal_year = p_year
   where my_role() = 'office'
     and (c.web_signup or exists (select 1 from plan_orders o where o.company_id = c.id))
   order by c.created_at desc
$$;

grant execute on function public.office_web_companies(int) to authenticated;

-- ------------------------------------------------------------
-- 6. 企業の統合(リカバリ用・実施者のみ)
--    継続利用の企業が誤って「新規」で申し込み、別の企業として開設された場合などに、
--    その企業(p_from)のデータをすべて元の企業(p_to)に移し、p_from を削除する。
--    移すもの: 受検期間・人数枠(同じ年度があれば人数を合算)、配布URL(元の企業に同じ年度が無ければ
--    URLをそのまま引き継ぐので、配布済みのQRコードも使える)、申込・支払いの記録、担当者・従業員、
--    受検結果、面接指導の申出、部署、在籍労働者数、報告書の記載事項、操作記録
--    1つのトランザクションで行い、途中で失敗したら何も変わらない
-- ------------------------------------------------------------
create or replace function public.office_merge_company(p_from uuid, p_to uuid)
returns text
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_from companies;
  v_to   companies;
  r      record;
  v_users int;
  v_results int;
  v_note  text := '';
begin
  if coalesce(my_role(), '') <> 'office' then
    raise exception '企業の統合ができるのは実施者のみです';
  end if;
  if p_from = p_to then
    raise exception '統合元と統合先が同じ企業です';
  end if;
  select * into v_from from companies where id = p_from for update;
  select * into v_to   from companies where id = p_to for update;
  if v_from.id is null or v_to.id is null then
    raise exception '企業が見つかりません';
  end if;
  -- 同じ人が両方の企業で同じ年度に受検している場合は、どちらを残すか判断が必要なので止める
  -- (通常は1人1アカウント=1企業なので起きない)
  if exists (
    select 1 from results a join results b on a.user_id = b.user_id and a.fiscal_year = b.fiscal_year
     where a.company_id = p_from and b.company_id = p_to
  ) then
    raise exception '同じ方が両方の企業で同じ年度に受検しています。統合する前に実施者が確認してください';
  end if;

  -- 受検期間・人数枠: 統合先に同じ年度があれば人数を合算し、期間は広い方に合わせる
  for r in select * from exam_plans where company_id = p_from loop
    if exists (select 1 from exam_plans p where p.company_id = p_to and p.fiscal_year = r.fiscal_year) then
      update exam_plans p
         set seats = p.seats + r.seats,
             exam_start = least(p.exam_start, r.exam_start),
             max_end = greatest(p.max_end, r.max_end),
             exam_end = greatest(p.exam_end, r.exam_end),
             updated_at = now()
       where p.company_id = p_to and p.fiscal_year = r.fiscal_year;
      delete from exam_plans p where p.company_id = p_from and p.fiscal_year = r.fiscal_year;
    else
      update exam_plans p set company_id = p_to, updated_at = now()
       where p.company_id = p_from and p.fiscal_year = r.fiscal_year;
    end if;
  end loop;

  -- 配布URL: 統合先に同じ年度のURLが無ければ、統合元のURLをそのまま引き継ぐ(配布済みのQRがそのまま使える)
  for r in select * from campaigns where company_id = p_from loop
    if exists (select 1 from campaigns k where k.company_id = p_to and k.fiscal_year = r.fiscal_year) then
      delete from campaigns k where k.id = r.id;
      v_note := v_note || r.fiscal_year || '年度の配布URLは統合先のものを使います(統合元のQRは無効)。';
    else
      update campaigns k set company_id = p_to where k.id = r.id;
    end if;
  end loop;

  update plan_orders set company_id = p_to where company_id = p_from;
  update profiles set company_id = p_to where company_id = p_from;
  get diagnostics v_users = row_count;
  update results set company_id = p_to where company_id = p_from;
  get diagnostics v_results = row_count;
  update interview_requests set company_id = p_to where company_id = p_from;
  update access_logs set company_id = p_to where company_id = p_from;

  insert into departments (company_id, name, sort_order)
  select p_to, d.name, d.sort_order from departments d where d.company_id = p_from
  on conflict (company_id, name) do nothing;
  delete from departments where company_id = p_from;

  insert into company_year_info (company_id, fiscal_year, headcount, updated_at, updated_by)
  select p_to, y.fiscal_year, y.headcount, y.updated_at, y.updated_by from company_year_info y where y.company_id = p_from
  on conflict (company_id, fiscal_year) do nothing;
  delete from company_year_info where company_id = p_from;

  if not exists (select 1 from company_report_info i where i.company_id = p_to) then
    update company_report_info set company_id = p_to where company_id = p_from;
  end if;
  delete from company_report_info where company_id = p_from;

  delete from plan_reminders where company_id = p_from;
  -- 統合先にWeb申込の登録情報が無ければ引き継ぐ
  update companies c
     set web_signup = c.web_signup or v_from.web_signup,
         address = coalesce(c.address, v_from.address),
         workers = coalesce(c.workers, v_from.workers),
         contact_phone = coalesce(c.contact_phone, v_from.contact_phone)
   where c.id = p_to;

  -- 統合元の企業を削除する。健康管理Webなど他の機能のデータが残っていて削除できない場合は、名前に印を付けて残す
  begin
    delete from companies where id = p_from;
  exception when foreign_key_violation then
    update companies
       set name = '【統合済み→' || v_to.code || '】' || v_from.name, web_signup = false, biz_id = null
     where id = p_from;
    v_note := v_note || '統合元の企業は他のデータが残っているため削除せず、名前に【統合済み】を付けました。';
  end;

  insert into access_logs (user_id, role, action, target, company_id)
  values (auth.uid(), 'office', 'merge_company',
          v_from.name || '(' || v_from.code || ') → ' || v_to.name || '(' || v_to.code || ')', p_to);

  return format('%s(%s)を%s(%s)に統合しました。アカウント %s件・受検結果 %s件を移しました。%s',
                v_from.name, v_from.code, v_to.name, v_to.code, v_users, v_results, v_note);
end $$;

grant execute on function public.office_merge_company(uuid, uuid) to authenticated;

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
