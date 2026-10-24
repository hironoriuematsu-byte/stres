-- ============================================================
-- 0033: 電子契約(産業医業務委託契約の電子締結)
--
-- うえまつ産業医事務所(乙)が、契約企業(甲)と産業医業務委託契約を Web 上で締結するための仕組み。
-- クラウドサイン等と同じ「事業者署名型(立会人型)」の方式:
--   1) 実施者(office)が契約内容を入力して下書きを作り、契約先の署名者のメールアドレスへ署名用リンクを送る
--      (送信の時点で乙の合意を記録。文面はこの時点で確定し、SHA-256 のハッシュを保存する)
--   2) 署名者はリンクを開いて契約書を読み、氏名・役職を入力して「同意して締結」を押す(任意でアクセスコード)
--   3) 署名の時点で甲の合意を記録し、記録の連鎖の末尾と文面のハッシュにサーバーの秘密鍵で事業者署名(HMAC)を付ける
--   4) 双方に締結完了のメールを送る。契約書と合意締結証明(監査証跡)はいつでも閲覧・印刷できる
--
--   contracts       : 契約(内容・文面の確定版・ハッシュ・状態・署名者・リンクのトークンのハッシュ)
--   contract_events : 記録(監査証跡)。1件ずつ直前のハッシュを含めたハッシュを持つ(改ざん検知)
--
-- 権限:
--   - office: すべて閲覧(作成・送信・取消はサーバー API 経由)
--   - jimu  : 自社の契約のうち、送信済み・締結済みのものを閲覧(証明も閲覧できる)
--   - 署名者(契約先)はログインせず、メールのリンク(トークン)で閲覧・署名する(サーバー API 経由)
--   - 書き込みはすべてサーバー(service_role)経由。anon・authenticated からの更新は不可
--
-- 電子帳簿保存法の検索要件(取引年月日・取引金額・取引先)のため、契約開始日・月額・契約先名を列に持つ。
-- 実行方法: Supabase SQL Editor に全文を貼り付けて Run。再実行しても問題ない。
-- ============================================================

create table if not exists public.contracts (
  id                 uuid primary key default gen_random_uuid(),
  contract_no        text unique,                                       -- 契約番号(E2026-XXXXXXXX。サーバーが id から作る)
  kind               text not null default 'sanpoi' check (kind in ('sanpoi')), -- sanpoi: 産業医業務委託契約
  status             text not null default 'draft'
                     check (status in ('draft', 'sent', 'signed', 'declined', 'cancelled')),
  company_id         uuid references public.companies(id) on delete set null, -- 契約先の企業(登録済みの場合)
  fields             jsonb not null default '{}'::jsonb,                -- 契約の内容(入力値)
  template_version   int,                                               -- 送信時の文面の版
  document           jsonb,                                             -- 送信時に確定した契約書(構造化)
  document_text      text,                                              -- 同・ハッシュを取った文面
  document_hash      text,                                              -- 文面の SHA-256
  party_name         text not null default '',                          -- 契約先の名称(検索用)
  signer_name        text not null default '',
  signer_email       text not null default '',
  signer_title       text,
  monthly_fee        int,                                               -- 月額報酬(税込・検索用)
  start_date         date,                                              -- 契約開始日(検索用)
  token_hash         text unique,                                       -- 署名用リンクのトークンのハッシュ(トークン自体は保存しない)
  token_expires_at   timestamptz,                                       -- 署名の期限(閲覧は期限後もできる)
  access_code_hash   text,                                              -- アクセスコードのハッシュ(使わないときは null)
  code_attempts      int not null default 0,                            -- アクセスコードの入力ミスの回数
  sent_at            timestamptz,
  sent_by            uuid references auth.users(id) on delete set null,
  viewed_at          timestamptz,                                       -- 甲が最初に開いた日時
  signed_at          timestamptz,
  signed_name        text,                                              -- 署名時に甲が入力した氏名・役職
  signed_title       text,
  signed_ip          text,
  declined_at        timestamptz,
  decline_reason     text,
  cancelled_at       timestamptz,
  completion_hash    text,                                              -- 締結時点の記録の連鎖の末尾のハッシュ
  service_signature  text,                                              -- 事業者署名(HMAC-SHA256)。秘密鍵が未設定なら null
  note               text,                                              -- 実施者のメモ(契約書には載らない)
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_contracts_company on public.contracts (company_id, status);
create index if not exists idx_contracts_status on public.contracts (status, updated_at desc);

create table if not exists public.contract_events (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.contracts(id) on delete cascade,
  seq          int  not null,                                           -- 契約内の通し番号(1から)
  event        text not null
               check (event in ('created', 'updated', 'sent', 'resent', 'viewed', 'signed', 'completed', 'declined', 'cancelled')),
  actor        text not null check (actor in ('office', 'party', 'system')),
  actor_name   text,
  actor_email  text,
  ip           text,
  user_agent   text,
  at           timestamptz not null default now(),
  detail       jsonb,
  prev_hash    text,
  hash         text not null,
  unique (contract_id, seq)
);

create index if not exists idx_contract_events_contract on public.contract_events (contract_id, seq);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.contracts enable row level security;
alter table public.contract_events enable row level security;

drop policy if exists contracts_read_office on public.contracts;
create policy contracts_read_office on public.contracts
  for select using (my_role() = 'office');

-- 実施事務従事者: 自社の送信済み・締結済みの契約(下書き・取消は見せない)
drop policy if exists contracts_read_jimu on public.contracts;
create policy contracts_read_jimu on public.contracts
  for select using (
    my_role() = 'jimu' and company_id is not null and company_id = my_company()
    and status in ('sent', 'signed')
  );

drop policy if exists contract_events_read_office on public.contract_events;
create policy contract_events_read_office on public.contract_events
  for select using (my_role() = 'office');

drop policy if exists contract_events_read_jimu on public.contract_events;
create policy contract_events_read_jimu on public.contract_events
  for select using (
    my_role() = 'jimu' and exists (
      select 1 from public.contracts c
       where c.id = contract_id and c.company_id = my_company() and c.status in ('sent', 'signed')
    )
  );

-- 署名用リンクのトークン・アクセスコードのハッシュは、ログイン利用者には見せない(列権限)
revoke all on table public.contracts from anon;
revoke all on table public.contracts from authenticated;
grant select (
  id, contract_no, kind, status, company_id, fields, template_version, document, document_hash,
  party_name, signer_name, signer_email, signer_title, monthly_fee, start_date, token_expires_at,
  sent_at, viewed_at, signed_at, signed_name, signed_title, declined_at, decline_reason, cancelled_at,
  completion_hash, service_signature, note, created_at, updated_at
) on table public.contracts to authenticated;

revoke all on table public.contract_events from anon;
revoke all on table public.contract_events from authenticated;
grant select on table public.contract_events to authenticated;


select 'OK: 0033 econtracts' as result;
