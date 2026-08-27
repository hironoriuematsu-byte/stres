-- ============================================================
-- 0015: 調査票の種類(57項目版 / 80項目版)への対応
--
-- 厚労省「職業性ストレス簡易調査票(80項目版)」= 現行57項目 +
-- 新職業性ストレス簡易調査票 推奨尺度セット短縮版23項目。
--   - 企業ごとにどちらの調査票を使うかを設定する
--     (集団分析の一貫性のため、事業場単位で統一する)
--   - 高ストレス判定は従来どおり57項目部分で行うため、
--     判定・判定図・既存データへの影響はない
--   - 追加23項目の回答は results.answers_ext(jsonb配列)に保存する
-- ============================================================

-- 企業ごとの調査票設定(既定は現行の57項目版)
alter table public.companies
  add column if not exists questionnaire text not null default '57'
    check (questionnaire in ('57', '80'));

-- 追加23項目の回答(80項目版で受検した場合のみ入る)
alter table public.results
  add column if not exists answers_ext jsonb;

-- 受検時にどちらの調査票で回答したかを記録する(後から設定を変えても
-- 過去データの解釈が変わらないようにするため)
alter table public.results
  add column if not exists questionnaire text not null default '57'
    check (questionnaire in ('57', '80'));

-- 受検者が自分の結果を登録する際に追加分も保存できるようにする
-- (0002/0013 の insert ポリシーは列を限定していないため追加の付与は不要。
--  念のため authenticated への列権限を明示する)
grant insert (answers_ext, questionnaire) on table public.results to authenticated;

-- 実施者のみが企業の調査票設定を変更できる(companies のRLSに従う)
grant update (questionnaire) on table public.companies to authenticated;
