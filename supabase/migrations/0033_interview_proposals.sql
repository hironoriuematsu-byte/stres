-- ============================================================
-- 0033: 面接指導の日程調整 — 本人からの希望日時(医師が承認して確定)
--   - 医師が出した候補に都合の合う日時がないとき、本人が候補の最終日より後の営業日から希望日時を5つまで選んで送る
--   - 医師は希望日時を見て1つを承認すると確定する(オンライン面談のURLを付けて本人に案内する)
--   - どれも合わなければ、医師が候補を出し直す(希望日時は「見送り」になる)
--   - 書き込みはサーバー(service_role)経由のみ。希望日時は本人と実施者だけが読める(0032 の interview_slots の権限のまま)
-- 0032 の実行後に実行する。何度実行しても同じ結果になる
-- ============================================================

-- 本人が希望日時を送った日時と、希望に添えた連絡(例: 夕方以降なら可)
alter table public.interview_requests add column if not exists proposed_at timestamptz;
alter table public.interview_requests add column if not exists proposal_note text;

-- 候補の行に「本人の希望」を区別する印を付ける
alter table public.interview_slots add column if not exists proposed_by_user boolean not null default false;

-- 候補の状態に「本人の希望(医師の承認待ち)」と「見送り」を加える
alter table public.interview_slots drop constraint if exists interview_slots_status_check;
alter table public.interview_slots add constraint interview_slots_status_check
  check (status in ('open', 'chosen', 'withdrawn', 'proposed', 'declined'));

create index if not exists idx_interview_slots_proposed on public.interview_slots (request_id) where status = 'proposed';

select 'OK: 0033 interview_proposals' as result;
