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
