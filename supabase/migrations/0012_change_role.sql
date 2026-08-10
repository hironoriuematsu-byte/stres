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
