-- ============================================================
-- ストレスチェックWebシステム 実運用版スキーマ
-- うえまつ産業医事務所 マルチテナント構成
--
-- ロール設計:
--   office   = 産業医事務所(実施者)。全契約企業を横断閲覧
--   jimu     = 実施事務従事者(各企業に所属)。自社の全結果を閲覧
--              ※人事権を持たない旨の誓約(attestation)がないと閲覧不可
--   company  = 事業者側担当者(人事等)。自社の「同意あり」結果と集団分析のみ
--   employee = 従業員。自分の結果のみ
--
-- 企業間分離: すべてのポリシーが company_id で分離。
--   企業Aのアカウントから企業Bのデータは行レベルで一切返らない。
--
-- 実行方法: 新規Supabaseプロジェクトで SQL Editor に貼り付けてRun。
--   (旧プロトタイプのテーブルが残っている場合は先に下のDROP文を実行)
-- ============================================================

-- ---- 旧テーブルの掃除(初回は何も起きません) ----
drop function if exists group_analysis(uuid, date, date);
drop function if exists log_access(text, text, uuid);
drop function if exists my_attested();
drop function if exists my_company();
drop function if exists my_role();
drop table if exists access_logs;
drop table if exists interview_requests;
drop table if exists results;
drop table if exists profiles;
drop table if exists companies;

-- ============================================================
-- 1. テーブル定義
-- ============================================================

create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text unique not null,          -- 招待時に使う企業コード(例: KYT001)
  created_at timestamptz not null default now()
);

create table profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('office','jimu','company','employee')),
  name       text not null,
  emp_id     text,
  dept       text,
  company_id uuid references companies(id),
  -- 実施事務従事者の誓約: 「人事権(解雇・昇進・異動の決定権)を持たない」
  no_personnel_authority boolean not null default false,
  attested_at timestamptz,
  created_at  timestamptz not null default now(),
  -- office以外は必ず企業に所属する
  constraint company_required check (role = 'office' or company_id is not null)
);

create table results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  company_id  uuid not null references companies(id),
  dept        text not null,
  fiscal_year int  not null,                -- 実施年度(例: 2026)
  answers     jsonb not null,               -- 57項目の生回答
  score_a     int not null,
  score_b     int not null,
  score_c     int not null,
  score_d     int not null,
  high_stress boolean not null,
  consent     boolean not null default false, -- 事業者への提供同意
  created_at  timestamptz not null default now(),
  -- 同一人物は同一年度に1回のみ受検
  unique (user_id, fiscal_year)
);

create table interview_requests (
  id          uuid primary key default gen_random_uuid(),
  result_id   uuid not null references results(id),
  user_id     uuid not null references auth.users(id),
  company_id  uuid not null references companies(id),
  message     text,                          -- 本人からの連絡事項(任意)
  preferred   text,                          -- 希望日時など(任意)
  status      text not null default 'pending'
              check (status in ('pending','scheduled','done','cancelled')),
  created_at  timestamptz not null default now()
);

create table access_logs (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  role       text,
  action     text not null,     -- 例: view_results / export_csv / view_interview
  target     text,              -- 対象の説明(結果ID・画面名など)
  company_id uuid,
  created_at timestamptz not null default now()
);

create index idx_results_company_year on results(company_id, fiscal_year);
create index idx_ir_company on interview_requests(company_id, status);
create index idx_logs_created on access_logs(created_at);

-- ============================================================
-- 2. ヘルパー関数(RLS内で自分の属性を参照する)
-- ============================================================

create function my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where user_id = auth.uid() $$;

create function my_company() returns uuid
language sql stable security definer set search_path = public as
$$ select company_id from profiles where user_id = auth.uid() $$;

-- 実施事務従事者の誓約チェック(誓約なし=個人結果を閲覧不可)
create function my_attested() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce(no_personnel_authority, false)
   from profiles where user_id = auth.uid() $$;

-- ============================================================
-- 3. RLS 有効化
-- ============================================================

alter table companies          enable row level security;
alter table profiles           enable row level security;
alter table results            enable row level security;
alter table interview_requests enable row level security;
alter table access_logs        enable row level security;

-- ---- companies ----
create policy "office reads all companies" on companies
  for select using (my_role() = 'office');
create policy "members read own company" on companies
  for select using (id = my_company());
create policy "office manages companies" on companies
  for all using (my_role() = 'office') with check (my_role() = 'office');

-- ---- profiles ----
create policy "read own profile" on profiles
  for select using (user_id = auth.uid());
create policy "office reads all profiles" on profiles
  for select using (my_role() = 'office');
create policy "jimu reads own-company profiles" on profiles
  for select using (my_role() = 'jimu' and company_id = my_company());
create policy "office manages profiles" on profiles
  for all using (my_role() = 'office') with check (my_role() = 'office');
create policy "user updates own attestation" on profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- results: 閲覧(法66条の10の核心) ----
-- 本人: 自分の結果のみ
create policy "employee reads own results" on results
  for select using (user_id = auth.uid());

-- 事務所(実施者): 全企業の全結果
create policy "office reads all results" on results
  for select using (my_role() = 'office');

-- 実施事務従事者: 自社の全結果。ただし人事権なしの誓約が必須
create policy "jimu reads own-company results" on results
  for select using (
    my_role() = 'jimu'
    and company_id = my_company()
    and my_attested() = true
  );

-- 事業者担当者: 自社 かつ 本人同意ありのみ
create policy "company reads consented results" on results
  for select using (
    my_role() = 'company'
    and company_id = my_company()
    and consent = true
  );

-- ---- results: 登録は本人のみ・自社分のみ。更新/削除ポリシーなし=不可(改ざん防止・5年保存) ----
create policy "employee inserts own result" on results
  for insert with check (
    user_id = auth.uid()
    and company_id = my_company()
    and my_role() = 'employee'
  );

-- 同意フラグのみ本人が後から変更可能(同意の撤回・追加)
create policy "employee updates own consent" on results
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- interview_requests(面接指導の申出) ----
create policy "employee creates own request" on interview_requests
  for insert with check (user_id = auth.uid() and company_id = my_company());
create policy "employee reads own requests" on interview_requests
  for select using (user_id = auth.uid());
create policy "office reads all requests" on interview_requests
  for select using (my_role() = 'office');
create policy "jimu reads own-company requests" on interview_requests
  for select using (my_role() = 'jimu' and company_id = my_company() and my_attested());
create policy "office updates request status" on interview_requests
  for update using (my_role() = 'office') with check (my_role() = 'office');
create policy "jimu updates own-company request status" on interview_requests
  for update using (my_role() = 'jimu' and company_id = my_company() and my_attested())
  with check (my_role() = 'jimu' and company_id = my_company());

-- ---- access_logs: 誰でも自分の行動を記録できる。閲覧はofficeのみ。削除不可 ----
create policy "insert own log" on access_logs
  for insert with check (user_id = auth.uid());
create policy "office reads logs" on access_logs
  for select using (my_role() = 'office');

-- ============================================================
-- 4. 集団分析(10名以上の部署のみ返す)— DB層で強制
-- ============================================================

create function group_analysis(
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
    having count(*) >= 10;   -- ★ 10名未満の部署はDBが返さない
end $$;

-- ============================================================
-- 5. アクセスログ記録用の簡易RPC(フロントから1行で呼べる)
-- ============================================================

create function log_access(p_action text, p_target text, p_company uuid)
returns void language sql security definer set search_path = public as
$$ insert into access_logs(user_id, role, action, target, company_id)
   values (auth.uid(), my_role(), p_action, p_target, p_company) $$;

-- ============================================================
-- 6. 面接指導申出の自動ログ(監査証跡)
-- ============================================================

create function trg_log_interview() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into access_logs(user_id, role, action, target, company_id)
  values (new.user_id, 'employee', 'interview_request_created', new.id::text, new.company_id);
  return new;
end $$;

create trigger t_log_interview after insert on interview_requests
  for each row execute function trg_log_interview();

-- ============================================================
-- 完了。次のステップ:
--  1) Table Editorで companies に契約企業を登録
--  2) Authentication > Users でユーザーを招待し、profiles にロールを登録
--  3) 面接指導申出のメール通知は Database Webhooks + Edge Function で設定
--     (手順は claude-code-spec.md 参照)
-- ============================================================
