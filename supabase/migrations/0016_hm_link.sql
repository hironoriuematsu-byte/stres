-- ============================================================
-- 0016: 健康管理Web(kenko-kanri)との接続準備
--
-- 健康管理Webは同じSupabaseプロジェクトに同居し、ストレスチェックの
-- データを「読み取りのみ」で参照する。ストレスチェックWeb側は健康管理Web
-- に一切依存しない(hm_ で始まるテーブル・関数が存在しなくても、
-- ストレスチェックWebはこれまでどおり単独で動作する)。
--
-- このマイグレーションで行うのは次の2点のみで、いずれも追加のみ。
--   (1) profiles に健康管理Web用の別名列を追加する
--   (2) companies に健康管理Webの利用有無のフラグを追加する
-- ============================================================


-- ------------------------------------------------------------
-- (1) profiles の別名列
--
-- 健康管理Webは開発時から profiles を
--   id / full_name / employee_no / department
-- という列名で参照する前提で作られている。一方、ストレスチェックWebの
-- profiles は user_id / name / emp_id / dept である。
--
-- 実データを二重に持つのではなく、既存列から自動生成される「別名の列」を
-- 追加して両方の名前で読めるようにする(生成列のため書き込みは不可。
-- 値は常に元の列と一致し、ずれることはない)。
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists id uuid generated always as (user_id) stored;

alter table public.profiles
  add column if not exists full_name text generated always as (name) stored;

alter table public.profiles
  add column if not exists employee_no text generated always as (emp_id) stored;

alter table public.profiles
  add column if not exists department text generated always as (dept) stored;

-- 健康管理Web側のテーブルは profiles(id) を外部キーで参照するため、
-- id に一意制約が必要(user_id の主キーと同じ値なので実質的な制約は増えない)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_id_key'
  ) then
    alter table public.profiles add constraint profiles_id_key unique (id);
  end if;
end $$;


-- ------------------------------------------------------------
-- (2) 企業ごとの健康管理Web利用フラグ
--
-- ストレスチェックのみのご契約(産業医契約のない外部企業など)では false の
-- ままにしておく。false の企業には、ストレスチェックWebの画面に健康管理Web
-- への導線が一切表示されない。
-- ------------------------------------------------------------

alter table public.companies
  add column if not exists hm_enabled boolean not null default false;

-- 実施者のみが変更できる(companies のRLSに従う)
grant update (hm_enabled) on table public.companies to authenticated;


-- ------------------------------------------------------------
-- 適用状況の確認
-- ------------------------------------------------------------
select * from (
  values
    ('profiles の別名列(id/full_name/employee_no/department)',
     (select case when count(*) = 4 then '✅OK' else '❌未適用' end
        from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name in ('id', 'full_name', 'employee_no', 'department'))),
    ('profiles(id) の一意制約',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_constraint
       where conrelid = 'public.profiles'::regclass and conname = 'profiles_id_key')),
    ('companies.hm_enabled(健康管理Webの利用フラグ)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from information_schema.columns
       where table_schema = 'public' and table_name = 'companies' and column_name = 'hm_enabled'))
) as t(内容, 状態);
