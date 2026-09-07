-- ============================================================
-- 0017: 健康管理Webの「自社担当」(兼務)への対応
--
-- 実施事務従事者や従業員が、事業者側の担当者(衛生管理・人事)を
-- 兼ねることが多いため、アカウントを2つ持たずに済むようにする。
--
--   profiles.hm_company_access = true の人は、
--   「健康管理Webでは事業者担当者として扱う」
--
-- ストレスチェックWeb側の権限(role)は一切変えない。実施事務従事者は
-- 実施事務従事者のまま、従業員は従業員のままで、ストレスチェックの
-- 画面・閲覧範囲はこれまでどおり。この列が影響するのは健康管理Webだけ。
--
-- ※ 健康管理Web側でも hm_my_role() を更新する必要がある
--   (kenko-kanri の 0123_hm_company_access.sql)。本ファイルを先に適用する。
-- ============================================================

alter table public.profiles
  add column if not exists hm_company_access boolean not null default false;


-- ------------------------------------------------------------
-- 付与・解除は実施者のみ。列への直接の更新権限は与えず、
-- 関数経由に限定する(本人が自分に付与できないようにするため)。
-- ------------------------------------------------------------
create or replace function public.set_hm_company_access(p_user uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cur record;
  v_hm boolean;
begin
  if my_role() <> 'office' then
    raise exception 'permission denied';
  end if;

  select p.role, p.name, p.company_id into cur from profiles p where p.user_id = p_user;
  if not found then
    raise exception '対象のユーザーが見つかりません';
  end if;
  if cur.role not in ('employee', 'jimu') then
    raise exception 'この設定は従業員・実施事務従事者のみが対象です';
  end if;

  select hm_enabled into v_hm from companies where id = cur.company_id;
  if p_on and not coalesce(v_hm, false) then
    raise exception '健康管理Webを併用する企業のみ設定できます';
  end if;

  update profiles set hm_company_access = p_on where user_id = p_user;

  insert into access_logs(user_id, role, action, target, company_id)
  values (auth.uid(), my_role(), 'hm_company_access_changed',
          coalesce(cur.name, p_user::text) || ': 健康管理Webの自社担当を'
            || case when p_on then '有効' else '無効' end || 'にしました',
          cur.company_id);
end $$;

grant execute on function public.set_hm_company_access(uuid, boolean) to authenticated;


-- ------------------------------------------------------------
-- 適用状況の確認
-- ------------------------------------------------------------
select * from (
  values
    ('profiles.hm_company_access(健康管理Webの自社担当)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'hm_company_access')),
    ('set_hm_company_access(付与・解除の関数)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_hm_company_access'))
) as t(内容, 状態);
