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
