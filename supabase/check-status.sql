-- ============================================================================
-- ストレスチェックWeb: データベースの適用状況チェック(確認だけ・変更なし)
--
--   Supabase の SQL Editor に貼り付けて [Run] を押すと、
--   0007〜0015 の変更が適用済みかどうかの一覧が表示されます。
--   このスクリプトはデータベースを一切変更しません。
--   ❌未適用 があれば supabase/apply-0007-0015.sql を実行してください。
-- ============================================================================

select * from (
  values
    ('0007', '再受験のための結果削除',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'delete_result_for_retake')),

    ('0009', '配布URL・QRの発行(RPC)',
     (select case when count(*) = 4 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('get_campaign','issue_campaign','rotate_campaign','set_campaign_active'))),

    ('0010', '集団分析の「全体」行',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'group_analysis'
         and pg_get_functiondef(p.oid) like '%全体%')),

    ('0011', '部署名の修正',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'update_employee_dept')),

    ('0012', 'ロール変更(従業員⇔実施事務従事者)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'change_user_role')),

    ('0013', '実施事務従事者の自己受検',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from pg_policies
       where schemaname = 'public' and tablename = 'results'
         and policyname = 'jimu inserts own result')),

    ('0014', '部署マスタ(departmentsテーブル)',
     (select case when count(*) > 0 then '✅OK' else '❌未適用' end
        from information_schema.tables
       where table_schema = 'public' and table_name = 'departments')),

    ('0015', '80項目版への対応',
     (select case when count(*) = 3 then '✅OK' else '❌未適用' end
        from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'companies' and column_name = 'questionnaire')
           or (table_name = 'results'   and column_name in ('answers_ext','questionnaire')))))
) as t(番号, 内容, 状態);
