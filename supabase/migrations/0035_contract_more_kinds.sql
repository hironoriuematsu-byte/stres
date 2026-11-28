-- ============================================================
-- 0035: 電子契約の種類を追加(覚書・協力医師との業務委託契約)
--   kind: appointed(産業医選任契約) / advisory(産業医顧問契約) / memo_coop(協力医師の分担に関する覚書) /
--         coop_individual(協力医師・個人との業務委託) / coop_corporate(協力医師の所属法人との業務委託)
--   協力医師との契約は company_id を持たない(顧問先の担当者からは見えない)。
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run(0034 の実行後)。再実行しても問題ない
-- ============================================================

alter table public.contracts drop constraint if exists contracts_kind_check;
update public.contracts set kind = 'appointed' where kind = 'sanpoi';
alter table public.contracts add constraint contracts_kind_check
  check (kind in ('appointed', 'advisory', 'memo_coop', 'coop_individual', 'coop_corporate'));

select 'OK: 0035 contract_more_kinds' as result;
