-- ============================================================================
-- ストレスチェックWeb: 未適用のデータベース変更をまとめて適用するスクリプト
--   対象: 0007 / 0009 / 0010 / 0011 / 0012 / 0013 / 0014 / 0015
--   (0008 は 0009 に置き換わったため不要)
--
-- 【使い方】
--   1. Supabase の SQL Editor を開く
--      https://supabase.com/dashboard/project/mdspuujgiffyvmddtwhn/sql/new
--   2. このファイルの中身を全部コピーして貼り付け、[Run] を押す
--   3. 最後に「適用状況」の一覧が表示されるので、すべて OK になっていることを確認
--
-- 【安全性】
--   何度実行しても同じ結果になるように書いてあります(すでに適用済みの
--   ものは上書きされるだけ)。受検データが消えることはありません。
-- ============================================================================


-- ============================================================
-- 0007: 再受験のための結果削除
--
-- 結果は原則削除不可(改ざん防止・5年保存)だが、従業員が誤回答を
-- 申し出た場合に限り、実施者(office)または誓約済みの自社の
-- 実施事務従事者(jimu)が「当年度かつ本人の直近の結果」のみ
-- 削除できる(削除後に本人が同年度内で再受験する運用)。
-- 削除操作は必ずアクセスログに記録される。
-- ============================================================

create or replace function public.delete_result_for_retake(p_result uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  cur_fy int;
  jst timestamptz := now() at time zone 'Asia/Tokyo';
begin
  select * into r from results where id = p_result;
  if not found then
    raise exception '結果が見つかりません';
  end if;

  -- 権限: office、または該当企業の誓約済みjimuのみ
  if not (
    my_role() = 'office'
    or (my_role() = 'jimu' and my_company() = r.company_id and my_attested())
  ) then
    raise exception 'permission denied';
  end if;

  -- 当年度(4月始まり)の結果のみ削除可
  cur_fy := case when extract(month from jst) >= 4
                 then extract(year from jst)::int
                 else extract(year from jst)::int - 1 end;
  if r.fiscal_year <> cur_fy then
    raise exception '削除できるのは当年度(%年度)の結果のみです', cur_fy;
  end if;

  -- 本人の直近の結果のみ削除可
  if exists (
    select 1 from results r2
    where r2.user_id = r.user_id and r2.created_at > r.created_at
  ) then
    raise exception '削除できるのは本人の直近の結果のみです';
  end if;

  -- 紐づく面接指導申出も削除し、結果本体を削除
  delete from interview_requests where result_id = p_result;
  delete from results where id = p_result;

  -- 監査証跡
  insert into access_logs(user_id, role, action, target, company_id)
  values (auth.uid(), my_role(), 'delete_result_for_retake', p_result::text, r.company_id);
end $$;

grant execute on function public.delete_result_for_retake(uuid) to authenticated;


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


-- ============================================================
-- 0011: 部署名の修正(表記ゆれの統一)
--
-- 部署名は従業員の自己入力のため表記ゆれが起こり、集団分析で
-- 別部署として扱われてしまう。実施者(office)または誓約済みの
-- 自社の実施事務従事者(jimu)が、従業員の部署名を修正できる
-- SECURITY DEFINER 関数を追加する。
--   - プロフィールの部署名(以後の受検に反映)と、
--     指定年度の結果の部署名(集団分析に反映)を同時に更新
--   - 操作はアクセスログに記録
-- ============================================================

create or replace function public.update_employee_dept(
  p_user uuid,
  p_year int,
  p_dept text
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  target_company uuid;
  new_dept text := btrim(p_dept);
begin
  if new_dept is null or new_dept = '' then
    raise exception '部署名を入力してください';
  end if;

  select company_id into target_company from profiles where user_id = p_user;
  if not found then
    raise exception '対象の従業員が見つかりません';
  end if;

  -- 権限: office、または該当企業の誓約済みjimuのみ
  if not (
    my_role() = 'office'
    or (my_role() = 'jimu' and my_company() = target_company and my_attested())
  ) then
    raise exception 'permission denied';
  end if;

  -- プロフィール(以後の受検の初期値)と指定年度の結果の両方を更新
  update profiles set dept = new_dept where user_id = p_user;
  update results set dept = new_dept where user_id = p_user and fiscal_year = p_year;

  -- 監査証跡
  insert into access_logs(user_id, role, action, target, company_id)
  values (auth.uid(), my_role(), 'update_dept', p_user::text || '/' || p_year || '→' || new_dept, target_company);
end $$;

grant execute on function public.update_employee_dept(uuid, int, text) to authenticated;


-- ============================================================
-- 0012: ロール変更(実施事務従事者の交代対応)
--
-- 実施者(office)が、アプリ上から従業員⇔実施事務従事者の
-- ロールを切り替えられるようにする。
--   - 変更できるのは employee / jimu のロールのみ
--     (officeアカウントは対象外 = 誤操作・権限昇格の防止)
--   - どちらへの変更でも誓約はリセットされ、実施事務従事者に
--     なった人は初回に必ず誓約(+氏名確認)を行う
--   - 操作はアクセスログに記録
-- ============================================================

create or replace function public.change_user_role(p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cur record;
begin
  if my_role() <> 'office' then
    raise exception 'permission denied';
  end if;

  if p_role not in ('employee', 'jimu') then
    raise exception '指定できるロールは従業員または実施事務従事者のみです';
  end if;

  select role, name, company_id into cur from profiles where user_id = p_user;
  if not found then
    raise exception '対象のユーザーが見つかりません';
  end if;
  if cur.role not in ('employee', 'jimu') then
    raise exception 'このユーザーのロールは変更できません(対象は従業員・実施事務従事者のみ)';
  end if;
  if cur.role = p_role then
    return; -- 変更なし
  end if;

  -- 誓約はリセット(jimuに変更した場合は初回ログインで誓約が必要になる)
  update profiles
  set role = p_role, no_personnel_authority = false, attested_at = null
  where user_id = p_user;

  insert into access_logs(user_id, role, action, target, company_id)
  values (auth.uid(), my_role(), 'change_role',
          coalesce(cur.name, p_user::text) || ': ' || cur.role || '→' || p_role,
          cur.company_id);
end $$;

grant execute on function public.change_user_role(uuid, text) to authenticated;


-- ============================================================
-- 0013: 実施事務従事者の自己受検
--
-- 実施事務従事者(jimu)が自分のアカウントでストレスチェックを
-- 受検できるようにする。閲覧・同意変更・面接指導の申出は既存
-- ポリシーが本人条件(user_id = auth.uid())のためそのまま使える。
-- 不足していた「結果の登録」のみ追加する(自分の結果・自社のみ)。
-- ============================================================

drop policy if exists "jimu inserts own result" on public.results;
create policy "jimu inserts own result" on public.results
  for insert with check (
    user_id = auth.uid()
    and company_id = my_company()
    and my_role() = 'jimu'
  );


-- ============================================================
-- 0014: 部署マスタ(部署名の選択肢)
--
-- 従業員の自由入力による部署名の表記ゆれを防ぐため、企業ごとに
-- 部署名をあらかじめ登録し、受検時・修正時に選択できるようにする。
-- (一覧にない部署は従来どおり直接入力もできる)
--   - office: 全企業の部署を管理
--   - jimu(誓約済み): 自社の部署を管理
--   - 自社のメンバー(従業員含む): 選択肢として閲覧のみ
-- ============================================================

create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists departments_company_idx on public.departments (company_id);

alter table public.departments enable row level security;

-- 自社のメンバー(従業員・事務従事者)と実施者は選択肢として読める
drop policy if exists "members read own-company departments" on public.departments;
create policy "members read own-company departments" on public.departments
  for select using (company_id = my_company() or my_role() = 'office');

-- 実施者は全企業の部署を管理できる
drop policy if exists "office manages departments" on public.departments;
create policy "office manages departments" on public.departments
  for all using (my_role() = 'office') with check (my_role() = 'office');

-- 誓約済みの実施事務従事者は自社の部署を管理できる
drop policy if exists "jimu manages own-company departments" on public.departments;
create policy "jimu manages own-company departments" on public.departments
  for all using (my_role() = 'jimu' and company_id = my_company() and my_attested())
  with check (my_role() = 'jimu' and company_id = my_company() and my_attested());

grant select, insert, update, delete on table public.departments to authenticated;


-- ============================================================
-- 0015: 調査票の種類(57項目版 / 80項目版)への対応
--
-- 厚労省「職業性ストレス簡易調査票(80項目版)」= 現行57項目 +
-- 新職業性ストレス簡易調査票 推奨尺度セット短縮版23項目。
--   - 企業ごとにどちらの調査票を使うかを設定する
--     (集団分析の一貫性のため、事業場単位で統一する)
--   - 高ストレス判定は従来どおり57項目部分で行うため、
--     判定・判定図・既存データへの影響はない
--   - 追加23項目の回答は results.answers_ext(jsonb配列)に保存する
-- ============================================================

-- 企業ごとの調査票設定(既定は現行の57項目版)
alter table public.companies
  add column if not exists questionnaire text not null default '57'
    check (questionnaire in ('57', '80'));

-- 追加23項目の回答(80項目版で受検した場合のみ入る)
alter table public.results
  add column if not exists answers_ext jsonb;

-- 受検時にどちらの調査票で回答したかを記録する(後から設定を変えても
-- 過去データの解釈が変わらないようにするため)
alter table public.results
  add column if not exists questionnaire text not null default '57'
    check (questionnaire in ('57', '80'));

-- 受検者が自分の結果を登録する際に追加分も保存できるようにする
-- (0002/0013 の insert ポリシーは列を限定していないため追加の付与は不要。
--  念のため authenticated への列権限を明示する)
grant insert (answers_ext, questionnaire) on table public.results to authenticated;

-- 実施者のみが企業の調査票設定を変更できる(companies のRLSに従う)
grant update (questionnaire) on table public.companies to authenticated;


-- ============================================================================
-- 適用状況の確認(この結果が画面に表示されます)
--   「状態」がすべて ✅OK であれば適用完了です。
-- ============================================================================

select * from (
  values
    ('0007', '再受験のための結果削除',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_result_for_retake')),

    ('0009', '配布URL・QRの発行(RPC)',
     (select case when count(*) = 4 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('get_campaign','issue_campaign','rotate_campaign','set_campaign_active'))),

    ('0010', '集団分析の「全体」行',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'group_analysis'
         and pg_get_functiondef(p.oid) like '%全体%')),

    ('0011', '部署名の修正',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'update_employee_dept')),

    ('0012', 'ロール変更(従業員⇔実施事務従事者)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'change_user_role')),

    ('0013', '実施事務従事者の自己受検',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_policies
       where schemaname = 'public' and tablename = 'results'
         and policyname = 'jimu inserts own result')),

    ('0014', '部署マスタ(departmentsテーブル)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from information_schema.tables
       where table_schema = 'public' and table_name = 'departments')),

    ('0015', '80項目版への対応',
     (select case when count(*) = 3 then '✅OK' else '❌未適用' end
        from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'companies' and column_name = 'questionnaire')
           or (table_name = 'results'   and column_name in ('answers_ext','questionnaire')))))
) as t(番号, 内容, 状態);
