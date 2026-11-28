-- ============================================================
-- 0034: 電子契約の種類(選任契約 / 顧問契約)と、報酬の単位(月額 / 年額)
--   - kind: 'appointed'(産業医選任契約) / 'advisory'(産業医顧問契約)。初版の 'sanpoi' は選任契約として扱う
--   - fee_period: 'monthly' / 'yearly'。報酬額は従来どおり monthly_fee 列に入る(列名は初版の名残。単位は fee_period)
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run(0033 の実行後)。再実行しても問題ない
-- ============================================================

alter table public.contracts drop constraint if exists contracts_kind_check;
update public.contracts set kind = 'appointed' where kind = 'sanpoi';
update public.contracts set fields = fields || '{"kind":"appointed"}'::jsonb where not (fields ? 'kind');
alter table public.contracts alter column kind set default 'appointed';
alter table public.contracts add constraint contracts_kind_check check (kind in ('appointed', 'advisory'));

alter table public.contracts add column if not exists fee_period text not null default 'monthly'
  check (fee_period in ('monthly', 'yearly'));

-- ログイン利用者が読める列に fee_period を加える(0033 の列権限と同じ一覧 + fee_period)
revoke all on table public.contracts from authenticated;
grant select (
  id, contract_no, kind, status, company_id, fields, template_version, document, document_hash,
  party_name, signer_name, signer_email, signer_title, monthly_fee, fee_period, start_date, token_expires_at,
  sent_at, viewed_at, signed_at, signed_name, signed_title, declined_at, decline_reason, cancelled_at,
  completion_hash, service_signature, note, created_at, updated_at
) on table public.contracts to authenticated;

select 'OK: 0034 contract_kinds' as result;
