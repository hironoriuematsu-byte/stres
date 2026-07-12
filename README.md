# ストレスチェックWeb(実運用版)

厚生労働省「職業性ストレス簡易調査票(57項目)」準拠のストレスチェックシステムです。判定は合計点数法(B≧77、またはB≧63かつA+C≧76)。Next.js (App Router) + Supabase (Auth / Postgres / RLS) + Vercel で構成された、産業医事務所による複数企業(マルチテナント)運用向けの実装です。

## セキュリティ・法令対応(明記事項)

- **通信の暗号化**: Vercel/Supabaseの標準TLS(HTTPS)で全通信を暗号化
- **保存時の暗号化**: SupabaseのストレージはAES-256で保存時暗号化(東京リージョン: ap-northeast-1 を選択して運用)
- **結果の保存**: ストレスチェック結果は5年間保存する運用とし、システム上は削除・改変不可(resultsテーブルにUPDATE(同意列以外)/DELETEのRLSポリシー・権限なし)
- **閲覧範囲の制御**: 労働安全衛生法第66条の10に基づき、本人の同意なく事業者へ個人結果を提供しない制御をDBの行レベルセキュリティ(RLS)で実装。フロントの表示制御はUXのためであり、最終防衛線はRLS
- **実施事務従事者(jimu)**: 人事権(解雇・昇進・異動の決定権)を持たない旨の誓約を初回に取得(未誓約の間はRLSにより個人結果を閲覧不可)。**実施事務従事者の選任は衛生委員会の調査審議事項**です。各企業の衛生委員会で審議のうえ選任してください
- **アクセスログ**: 結果閲覧・CSV出力・申出閲覧・招待の操作を記録。削除不可(office のみ閲覧可)
- **メール通知**: 面接指導申出の通知メールに個人名・スコア等の要配慮個人情報を含めない

## ロールと閲覧範囲

| ロール | 想定者 | 個人結果 | 集団分析 | 面接指導申出 | アクセスログ |
|---|---|---|---|---|---|
| office | 産業医事務所 | 全企業・全結果 | 全企業 | 全企業分を閲覧・状態更新 | 閲覧可 |
| jimu | 実施事務従事者(企業ごと) | 自社の全結果 ※誓約必須 | 自社 | 自社分を閲覧・状態更新 | 不可 |
| company | 事業者側担当者 | 自社の同意ありのみ | 自社 | 不可 | 不可 |
| employee | 従業員 | 自分のみ | 不可 | 自分の申出のみ | 不可 |

**現在の運用では company(事業者担当者)アカウントは発行しません**(実施事務従事者に統一)。RLS・スキーマ上のcompanyロールの制御は将来のために残していますが、招待画面のロール選択は 従業員 / 実施事務従事者 のみです。

氏名・社員番号・部署は**従業員本人が受検時に入力**します(管理者は招待時にメールアドレスと企業のみ指定)。

企業間分離はすべてのRLSポリシーが company_id で行分離しており、企業Aのアカウントから企業Bのデータは1行も取得できません(受け入れテストで自動検証)。

## セットアップ

### 1. データベース

Supabase SQL Editor で以下を順に実行:

1. `supabase/migrations/0002_production.sql`(適用済みの場合はスキップ)
2. `supabase/migrations/0003_app_fixes.sql` — **必ず実行してください**。内容:
   - 旧プロトタイプが `auth.users` に残したトリガーの削除(**これを実行しないとユーザー招待が全件失敗します**)
   - 列レベル権限の締め付け(結果はconsent列のみ本人更新可 / role・company_idの自己変更を禁止)
   - companyロール用の同意済み結果RPC `consented_results`
3. `supabase/migrations/0004_employee_self_entry.sql` — **必ず実行してください**。従業員本人が社員番号を入力できるようにする列権限の追加です

### 2. 契約企業とofficeアカウントの登録

1. Table Editor で `companies` に企業を登録(name, code。codeは招待時に使う企業コード。例: KYT001)
2. Authentication > Users で事務所メンバーを「Add user」(Auto Confirm)
3. SQL Editor で office プロフィールを登録:

```sql
insert into public.profiles (user_id, role, name)
values ('<officeユーザーのUID>', 'office', '植松 太郎');
```

以後のユーザー(従業員・jimu)は、officeダッシュボードの「ユーザー管理」から招待できます(単発またはCSV一括: **メール, 企業コード** の2列)。氏名・社員番号・部署は本人が受検時に入力します。

### 3. Vercel

環境変数(Settings > Environment Variables):

| 変数 | 用途 | 公開範囲 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトURL | クライアント公開(問題なし) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anonキー(RLS前提の操作のみ) | クライアント公開(問題なし) |
| `SUPABASE_SERVICE_ROLE_KEY` | 招待API(/api/invite)専用 | **サーバーのみ。絶対にNEXT_PUBLIC_を付けない** |

GitHubへのpushで自動デプロイされます。

独自ドメイン(例: check.mestate.jp)の設定手順:
1. Vercel: プロジェクト > Settings > Domains > Add で `check.mestate.jp` を追加
2. 表示されるCNAMEレコード(`cname.vercel-dns.com`)をドメインのDNSに追加
3. 発行完了後、SupabaseのAuthentication > URL Configuration の Site URL / Redirect URLs を新ドメインに更新(`https://check.mestate.jp` と `https://check.mestate.jp/auth/callback`)

### 4. 認証まわりのSupabase設定

- Authentication > URL Configuration: Site URL = アプリURL、Redirect URLs に `{アプリURL}/auth/callback` を追加
- Authentication > Emails > SMTP Settings: カスタムSMTP(Resend)を設定(招待・パスワード再設定メールが従業員に届くために必須)
- Authentication > Rate Limits: メール送信レートを従業員数に合わせて調整

### 5. 面接指導申出のメール通知(Edge Function + Webhook)

1. Supabase CLIでEdge Functionをデプロイ:

```bash
supabase functions deploy notify-interview --project-ref <project-ref>
supabase secrets set RESEND_API_KEY=re_xxx SENDER_EMAIL=noreply@your-domain.jp APP_URL=https://your-app.example --project-ref <project-ref>
```

2. Dashboard > Database > Webhooks > Create:
   - Table: `interview_requests` / Events: INSERT
   - Type: Supabase Edge Function → `notify-interview`

通知先は「office全員 + 該当企業のjimu全員」。本文に個人名・スコアは含まれません。

## テスト

```bash
# ユニットテスト(スコアリング・年度判定・CSV生成/BOM・CSVパーサ)
npm test

# 受け入れテスト(実Supabaseに対する統合テスト。仕様書7章の1〜6+セキュリティ検証)
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_ANON_KEY=eyJ... \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm run test:acceptance
```

受け入れテストはテスト用の企業・ユーザー・結果を作成して検証し、終了時に削除します(検証用プロジェクトでの実行推奨)。検証項目:

1. 従業員が受検→本人に結果表示、同年度2回目は23505でブロック
2. 高ストレス者の申出→通知先選定が「自社jimu+office」で他社jimuを含まない(実メール着信はResendのEmails画面で手動確認)
3. 誓約済jimuは自社全結果を閲覧可・他社は0件、未誓約jimuは0件
4. companyは同意あり結果のみ+自社の集団分析のみ(他社分析はpermission denied)
5. 9名の部署は集団分析に出ず、10名の部署は出る(DB層で強制)
6. CSV出力(BOM付きUTF-8)+ 出力操作のアクセスログ記録、ログ閲覧はofficeのみ
7. (追加)結果スコアの改ざん・削除は不可/consentのみ本人更新可/roleの自己昇格不可

## ディレクトリ構成

```
src/
  app/
    exam/        従業員: 受検(年度重複時はブロック)
    my/          従業員: 結果・同意変更・面接指導申出
    office/      実施者: 企業横断ダッシュボード(結果/申出/集団分析/招待/ログ)
    jimu/        実施事務従事者: 誓約→自社ダッシュボード
    company/     事業者担当者: 集団分析+同意あり結果
    api/invite/  招待API(service_roleキーはここでのみ使用)
    login, reset-password, account/update-password, auth/callback
  components/    共有UI(結果一覧・申出一覧・集団分析グラフ・招待・ログ)
  lib/           スコアリング・年度・CSV・アクセスログ・Supabaseクライアント
supabase/
  migrations/    0002_production.sql(スキーマ+RLS) / 0003_app_fixes.sql(必須の補正)
  functions/     notify-interview(申出メール通知 Edge Function)
tests/
  unit/          ユニットテスト
  acceptance/    受け入れテスト(実Supabase統合)
```
