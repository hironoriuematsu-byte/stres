# ストレスチェックWeb

厚生労働省「職業性ストレス簡易調査票(57項目)」準拠のストレスチェックシステムです。Next.js (App Router) + Supabase (Auth / Postgres / Row Level Security) 上に構築されており、Vercel でホストします。

## ロール構成

| ロール | 用途 | 割り当て方法 |
| --- | --- | --- |
| `employee` | 受検者本人。自分の結果のみ閲覧可能 | `/signup` から自己サインアップ(既定ロール) |
| `office` | 産業医事務所。全受検者の結果を閲覧可能 | 管理者がSupabase側でロールを付与(下記参照) |
| `company_hr` | 企業人事担当者。同意済みの個人結果 + 部署別集計のみ閲覧可能 | 管理者がSupabase側でロールを付与(下記参照) |

`office` / `company_hr` は自己サインアップでは付与されません(権限昇格防止のため、DBトリガーで自己申告のロールは無視されます)。

## セットアップ手順

### 1. Supabase プロジェクトを作成

1. https://supabase.com で新規プロジェクトを作成します。
2. プロジェクトの Settings > API から `Project URL` と `anon public` キーを控えます。
3. SQL Editor を開き、`supabase/migrations/0001_init.sql` の内容をそのまま実行します。
   - `profiles` / `results` テーブル、RLSポリシー、部署別集計用の関数 `get_department_stats()` が作成されます。
4. Authentication > Providers で Email 認証(Email/Password)が有効になっていることを確認します。
   - 本番運用では Authentication > Email Templates の確認メールが正しく届くことを確認してください。
   - Authentication > URL Configuration の Redirect URLs に、デプロイ後のURL(例: `https://your-app.vercel.app/auth/callback`)を追加してください。

### 2. 事務所 / 企業アカウントの作成とロール付与

1. Authentication > Users で「Invite user」または「Add user」から office / company_hr 用のアカウントを作成します(メールアドレスを指定)。
2. SQL Editor で以下を実行し、ロールを付与します。

```sql
update public.profiles set role = 'office' where id = '<office担当者のuser id>';
update public.profiles set role = 'company_hr' where id = '<企業人事担当者のuser id>';
```

user id は Authentication > Users の一覧からコピーできます。

### 3. ローカル環境変数

`.env.example` を `.env.local` にコピーし、Supabase の値を設定します。

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

### 4. ローカルで起動

```bash
npm install
npm run dev
```

http://localhost:3000 で確認できます。

### 5. Vercel へデプロイ

1. GitHub リポジトリを Vercel にインポートします(https://vercel.com/new)。
2. Project Settings > Environment Variables に以下を追加します(Production / Preview 両方)。
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy を実行します。Next.js プロジェクトのため追加設定は不要です。
4. デプロイ後のURLを Supabase の Authentication > URL Configuration の Redirect URLs / Site URL に追加してください(例: `https://your-app.vercel.app/auth/callback`)。これを忘れると確認メールのリンクが機能しません。

## セキュリティ設計のポイント

- すべてのテーブルで Row Level Security (RLS) を有効化しています。anon key はクライアントに公開される前提で、実際のアクセス制御はすべて Postgres 側のポリシーで行っています。
- `results` テーブル: 本人は自分の行のみ insert/select 可能。`office` ロールは全件 select 可能。`company_hr` ロールは `consent_to_company = true` の行のみ select 可能(労働安全衛生法第66条の10に基づく取り扱い)。
- 部署別集計(`get_department_stats()`)は SECURITY DEFINER 関数として実装し、関数内で呼び出し元のロールを検証したうえで、同意の有無に関わらない集計値(件数・平均点)のみを返します。個人が特定できる生データは返しません。
- サインアップ時のロールは常に `employee` に固定され、クライアントから任意のロールを自己申告して昇格することはできません(`handle_new_user` トリガー)。
- `profiles.role` の自己更新は DB トリガーでブロックされており、`office` / `company_hr` への昇格は管理者が Supabase の SQL Editor(service role 権限)から行う必要があります。

## ディレクトリ構成

```
src/
  app/            Next.js App Router のページ・ルート
  components/     共通UIコンポーネント
  lib/
    questionnaire.ts   質問項目とスコアリングロジック
    supabase/           Supabase クライアント(ブラウザ/サーバー)
supabase/migrations/    DBスキーマ・RLSポリシーのSQL
```
