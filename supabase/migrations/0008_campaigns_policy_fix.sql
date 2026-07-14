-- ============================================================
-- 0008: 配布URL(campaigns)のRLSポリシー修復
--
-- 実施者(office)が新しい企業の配布URL・QRコードを発行しようとすると
-- 「new row violates row-level security policy for table "campaigns"」
-- になる問題への対応。office用の全操作ポリシーが欠落している環境で
-- ポリシーを再作成する(何度実行しても安全)。
-- ============================================================

alter table public.campaigns enable row level security;

-- office: 発行・再発行・停止(全企業)
drop policy if exists "office manages campaigns" on public.campaigns;
create policy "office manages campaigns" on public.campaigns
  for all using (my_role() = 'office') with check (my_role() = 'office');

-- jimu・従業員: 自社の配布情報の閲覧のみ
drop policy if exists "members read own-company campaigns" on public.campaigns;
create policy "members read own-company campaigns" on public.campaigns
  for select using (company_id = my_company());

-- テーブル権限も念のため付与(RLSが実際のアクセス制御を行う)
grant select, insert, update on table public.campaigns to authenticated;
