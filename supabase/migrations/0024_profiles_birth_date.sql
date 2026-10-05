-- ============================================================
-- 0024: 従業員プロフィールに生年月日を追加する
--
-- 健康管理Webで健診結果・カルテとストレスチェックのアカウントを突合するとき、
-- これまでは氏名(と任意入力の社員番号)しか手がかりが無く、同姓同名や氏名の表記ゆれで
-- 自動で紐付けられなかった。本人が確実に入力できる生年月日を加え、
-- 「社員番号」または「氏名+生年月日」で紐付けられるようにする。
--   - 本人: 登録時・受検時・アカウント設定で入力(自分の行のみ更新可)
--   - office / jimu: 従来どおり読み取り可
--   - company(事業者担当者): 自社の従業員プロフィールを読み取り可(健康管理Webのカルテ紐付け用。
--     氏名・社員番号・部署・生年月日のみで、受検結果は含まない)
--
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run。再実行しても問題ない。
-- 列を足すだけなので一瞬で終わり、受検中の従業員には影響しない。
-- SQLを実行する前にアプリが更新されても、列が無い間は生年月日を読み書きしないため動作に支障はない。
-- ============================================================

alter table public.profiles add column if not exists birth_date date;

-- 本人が自分の生年月日を更新できるようにする(列レベル権限: 0003 と同じ方式)
grant update (birth_date) on table public.profiles to authenticated;

-- 事業者担当者が自社の従業員プロフィールを読めるようにする(健康管理Webのカルテ紐付け用)
drop policy if exists "company reads own-company profiles" on public.profiles;
create policy "company reads own-company profiles" on public.profiles
  for select using (public.my_role() = 'company' and company_id = public.my_company());

-- 確認用: true なら完了
-- select exists (
--   select 1 from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' and column_name = 'birth_date'
-- ) as "0024 完了";
