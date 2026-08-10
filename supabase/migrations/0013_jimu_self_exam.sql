-- ============================================================
-- 0013: 実施事務従事者の自己受検
--
-- 実施事務従事者(jimu)が自分のアカウントでストレスチェックを
-- 受検できるようにする。閲覧・同意変更・面接指導の申出は既存
-- ポリシーが本人条件(user_id = auth.uid())のためそのまま使える。
-- 不足していた「結果の登録」のみ追加する(自分の結果・自社のみ)。
-- ============================================================

drop policy if exists "jimu inserts own result" on public.results;
create policy "jimu inserts own result" on public.results
  for insert with check (
    user_id = auth.uid()
    and company_id = my_company()
    and my_role() = 'jimu'
  );
