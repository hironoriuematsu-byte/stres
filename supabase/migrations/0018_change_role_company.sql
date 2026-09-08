-- ============================================================
-- 0018: ロール変更に「事業者担当者」を追加
--
-- 既に登録済みのアカウントは、招待をやり直しても招待メールが送れない
-- (メールアドレスは1つのアカウントに1回しか登録できないため)。
-- そのため、既存アカウントのロール変更で対応できるようにする。
--
--   - 従業員 ⇔ 実施事務従事者 ⇔ 事業者担当者 の変更を可能にする
--   - 事業者担当者にできるのは、健康管理Webを併用する企業のみ
--   - 実施者(office)アカウントは対象外(誤操作・権限昇格の防止)
--   - どの変更でも誓約はリセットする
--   - 事業者担当者にした場合は、兼務の印(hm_company_access)を外す
--     (事業者担当者そのものになるため、兼務の印は不要)
--   - 操作はアクセスログに記録
-- ============================================================

create or replace function public.change_user_role(p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  cur record;
  v_hm boolean;
begin
  if my_role() <> 'office' then
    raise exception 'permission denied';
  end if;

  if p_role not in ('employee', 'jimu', 'company') then
    raise exception '指定できるロールは従業員・実施事務従事者・事業者担当者のみです';
  end if;

  select role, name, company_id into cur from profiles where user_id = p_user;
  if not found then
    raise exception '対象のユーザーが見つかりません';
  end if;
  if cur.role not in ('employee', 'jimu', 'company') then
    raise exception 'このユーザーのロールは変更できません(実施者アカウントは対象外)';
  end if;
  if cur.role = p_role then
    return; -- 変更なし
  end if;

  -- 事業者担当者は健康管理Webを併用する企業のみ
  if p_role = 'company' then
    select hm_enabled into v_hm from companies where id = cur.company_id;
    if not coalesce(v_hm, false) then
      raise exception '事業者担当者は、健康管理Webを併用する企業のみ設定できます';
    end if;
  end if;

  -- 誓約はリセット(jimuに変更した場合は初回ログインで誓約が必要になる)
  update profiles
  set role = p_role,
      no_personnel_authority = false,
      attested_at = null,
      -- 事業者担当者になった場合、兼務の印は不要になるため外す
      hm_company_access = case when p_role = 'company' then false else hm_company_access end
  where user_id = p_user;

  insert into access_logs(user_id, role, action, target, company_id)
  values (auth.uid(), my_role(), 'change_role',
          coalesce(cur.name, p_user::text) || ': ' || cur.role || '→' || p_role,
          cur.company_id);
end $$;

grant execute on function public.change_user_role(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 適用状況の確認
-- ------------------------------------------------------------
select case
         when pg_get_functiondef(p.oid) like '%事業者担当者のみです%' then '✅OK'
         else '❌未適用'
       end as 状態,
       'change_user_role(事業者担当者への変更に対応)' as 内容
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'change_user_role';
