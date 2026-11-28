-- ============================================================
-- 0036: 電子契約の「確認用リンク」(署名なしで案文を確認し、問題なし / 修正希望を返せる)
--   - 下書きの間だけ有効。署名用リンクを送った時点で無効になる
--   - review_token はリンクそのもの(ハッシュではなく原文)。下書きを直しても同じリンクで最新の案文が見えるようにするため。
--     ログイン利用者(office / jimu)には列権限で見せない
--   - 相手の返答(問題なし / 修正希望とコメント)は最新のものを列に持ち、履歴は contract_events に残す
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run(0035 の実行後)。再実行しても問題ない
-- ============================================================

alter table public.contracts add column if not exists review_token text unique;
alter table public.contracts add column if not exists review_sent_at timestamptz;      -- 確認用リンクを最後に送った日時
alter table public.contracts add column if not exists review_viewed_at timestamptz;    -- 相手が最初に開いた日時
alter table public.contracts add column if not exists review_feedback_at timestamptz;  -- 最後の返答の日時
alter table public.contracts add column if not exists review_feedback_kind text check (review_feedback_kind in ('ok', 'revise'));
alter table public.contracts add column if not exists review_feedback text;            -- 最後の返答のコメント

alter table public.contract_events drop constraint if exists contract_events_event_check;
alter table public.contract_events add constraint contract_events_event_check
  check (event in ('created', 'updated', 'sent', 'resent', 'viewed', 'signed', 'completed', 'declined', 'cancelled',
                   'review_sent', 'review_viewed', 'review_ok', 'review_revise'));

revoke all on table public.contracts from authenticated;
grant select (
  id, contract_no, kind, status, company_id, fields, template_version, document, document_hash,
  party_name, signer_name, signer_email, signer_title, monthly_fee, fee_period, start_date, token_expires_at,
  sent_at, viewed_at, signed_at, signed_name, signed_title, declined_at, decline_reason, cancelled_at,
  completion_hash, service_signature, note, created_at, updated_at,
  review_sent_at, review_viewed_at, review_feedback_at, review_feedback_kind, review_feedback
) on table public.contracts to authenticated;

select 'OK: 0036 contract_review_link' as result;
