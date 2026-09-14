-- ============================================================
-- 0020: 健康管理Webの「閲覧のみ」担当者
--
-- 企業側で複数の担当者が健康管理Webを使う場合に、登録・編集はできず
-- 閲覧だけを許可する担当者を設定できるようにする。
--
--   profiles.hm_view_only = true の人は、健康管理Webで
--   「登録・編集・取込ができない(閲覧のみ)」担当者として扱う。
--
-- ストレスチェックWeb側の権限(role)は一切変えない。この列が影響するのは
-- 健康管理Webだけ(0017 の hm_company_access と同じ考え方)。
--
-- ※ 健康管理Web側でも判定関数を追加する(kenko-kanri の 0128)。本ファイルを先に適用する。
-- ============================================================

alter table public.profiles
  add column if not exists hm_view_only boolean not null default false;


-- ------------------------------------------------------------
-- 付与・解除は実施者のみ。列への直接の更新権限は与えず、関数経由に限定する
-- ------------------------------------------------------------
create or replace function public.set_hm_view_only(p_user uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cur record;
begin
  if my_role() <> 'office' then
    raise exception 'permission denied';
  end if;

  select p.role, p.name, p.company_id into cur from profiles p where p.user_id = p_user;
  if not found then
    raise exception '対象のユーザーが見つかりません';
  end if;
  if cur.role not in ('employee', 'jimu', 'company') then
    raise exception 'この設定は従業員・実施事務従事者・事業者担当者のみが対象です';
  end if;

  update profiles set hm_view_only = p_on where user_id = p_user;

  insert into access_logs(user_id, role, action, target, company_id)
  values (auth.uid(), my_role(), 'hm_view_only_changed',
          coalesce(cur.name, p_user::text) || ': 健康管理Webを閲覧のみに'
            || case when p_on then '設定' else '解除' end || 'しました',
          cur.company_id);
end $$;

grant execute on function public.set_hm_view_only(uuid, boolean) to authenticated;


-- ------------------------------------------------------------
-- 適用状況の確認
-- ------------------------------------------------------------
select * from (
  values
    ('profiles.hm_view_only(健康管理Webの閲覧のみ)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'hm_view_only')),
    ('set_hm_view_only(付与・解除の関数)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'set_hm_view_only'))
) as t(内容, 状態);
