-- ============================================================
-- 0003: 0002_production.sql 適用後に必ず実行する補正マイグレーション
--
-- 1) 旧プロトタイプ(0001)が auth.users に残したトリガーの削除
--    ※これを消さないと新規ユーザー作成(招待含む)が全件失敗します
-- 2) 列レベル権限の締め付け(RLSポリシーは変更しない=緩めない)
--    - results: 本人が更新できるのは consent 列のみ
--    - profiles: 本人が更新できるのは誓約・氏名・部署のみ
--      (role / company_id の自己変更=権限昇格・企業移動を防止。
--       ロール付与や所属変更は service_role 経由の管理APIで行う)
-- 3) company ロール用の同意済み結果RPC
--    (companyはprofilesを読めないため、氏名付き一覧はRPCで提供)
-- ============================================================

-- ---- 1) 旧トリガー・旧関数の掃除 ----
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.prevent_role_self_escalation();
drop function if exists public.get_department_stats();

-- ---- 2) 列レベル権限 ----
revoke update on table public.results from anon, authenticated;
grant update (consent) on table public.results to authenticated;

revoke update on table public.profiles from anon, authenticated;
grant update (name, dept, no_personnel_authority, attested_at)
  on table public.profiles to authenticated;

-- ---- 3) company用: 同意済み個人結果(氏名付き) ----
create or replace function public.consented_results(
  target_company uuid,
  target_year    int
)
returns table(
  taken_at    timestamptz,
  fiscal_year int,
  name        text,
  emp_id      text,
  dept        text,
  high_stress boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (my_role() = 'company' and my_company() = target_company) then
    raise exception 'permission denied';
  end if;

  return query
    select r.created_at, r.fiscal_year, p.name, p.emp_id, r.dept, r.high_stress
    from results r
    join profiles p on p.user_id = r.user_id
    where r.company_id = target_company
      and r.fiscal_year = target_year
      and r.consent = true
    order by r.created_at desc;
end $$;

grant execute on function public.consented_results(uuid, int) to authenticated;
