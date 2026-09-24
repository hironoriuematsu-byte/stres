-- ============================================================
-- 0022: 氏名が登録されていない状態では受検結果を保存できないようにする
--
-- 受検画面では氏名の入力を必須にしているが、空白だけの入力などで
-- 氏名が空のまま受検できた事例があった。画面側のチェックに加えて、
-- データベース側でも「氏名が空(空白のみ・「未設定」を含む)の利用者は
-- 結果を登録できない」ようにし、必ず氏名付きで保存されるようにする。
--
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run。再実行しても問題ない
-- ============================================================

-- 氏名が有効か(半角・全角の空白を除いて1文字以上あり、「未設定」でない)
create or replace function public.profile_name_ok(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from profiles p
     where p.user_id = p_user
       and p.name is not null
       and length(btrim(p.name, E' \t\r\n　')) > 0
       and btrim(p.name, E' \t\r\n　') <> '未設定'
  );
$$;

grant execute on function public.profile_name_ok(uuid) to authenticated;

-- 従業員: 自分の結果の登録(氏名が登録済みであること)
drop policy if exists "employee inserts own result" on public.results;
create policy "employee inserts own result" on public.results
  for insert with check (
    user_id = auth.uid()
    and company_id = my_company()
    and my_role() = 'employee'
    and public.profile_name_ok(auth.uid())
  );

-- 実施事務従事者が自分の受検をする場合(0013)も同じ条件
drop policy if exists "jimu inserts own result" on public.results;
create policy "jimu inserts own result" on public.results
  for insert with check (
    user_id = auth.uid()
    and company_id = my_company()
    and my_role() = 'jimu'
    and public.profile_name_ok(auth.uid())
  );

-- ------------------------------------------------------------
-- 適用状況の確認
-- ------------------------------------------------------------
select case when count(*) = 2 then '✅OK' else '❌未適用' end as 状態,
       '受検結果の登録に氏名の登録を必須化' as 内容
  from pg_policies
 where tablename = 'results'
   and policyname in ('employee inserts own result', 'jimu inserts own result')
   and qual is null
   and with_check like '%profile_name_ok%';

-- ------------------------------------------------------------
-- 参考: 氏名が空のまま受検した方の確認(結果一覧で氏名が空欄になっている方)
-- 該当者にはアカウント設定(画面右上)から氏名の登録を案内してください
-- ------------------------------------------------------------
select c.name as 企業, r.fiscal_year as 年度, p.emp_id as 社員番号, p.dept as 部署,
       r.created_at::date as 受検日, '「' || coalesce(p.name, '') || '」' as 現在の氏名
  from results r
  join profiles p on p.user_id = r.user_id
  join companies c on c.id = r.company_id
 where not public.profile_name_ok(r.user_id)
 order by c.name, r.created_at;
