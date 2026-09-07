# 健康管理Web との接続について(ストレスチェックWeb側の仕様)

作成: 2026-09-07 / 対象: うえまつ産業医事務所(Mestate LLC)

ストレスチェックWeb(このリポジトリ)と健康管理Web(`hironoriuematsu-byte/kenko-kanri`)は、
**同じSupabaseプロジェクトに同居**し、健康管理Web側からストレスチェックのデータを
**読み取りのみ**参照します。

---

## 1. 最重要の原則: ストレスチェックWebは単独で動く

ストレスチェックWebを、産業医契約のない外部企業へ有料で提供する予定があるため、
次を設計上の約束事とします。

- **ストレスチェックWebのコードは `hm_` で始まるテーブル・関数を一切参照しない。**
  健康管理Webが存在しない環境でも、これまでどおり全機能が動作します。
- 健康管理Webへの導線は、次の**両方**が満たされたときだけ表示されます。
  - 環境変数 `NEXT_PUBLIC_KENKO_URL` が設定されている
  - その企業の `companies.hm_enabled` が `true`
  どちらか一方でも欠ければ、画面に健康管理Webの痕跡は出ません。
- 依存の向きは**健康管理Web → ストレスチェックWeb の一方向のみ**です。
  逆向きの依存を作らないでください。

> ストレスチェック単独のご契約(産業医契約なし)の企業は、`hm_enabled` を `false` のままに
> しておけば、これまでと完全に同じ画面・同じ機能になります。

---

## 2. 適用の順序

| # | 実行するもの | 実行する場所 | 備考 |
|---|---|---|---|
| 1 | `supabase/migrations/0016_hm_link.sql` | ストレスチェックWeb | 追加のみ。既存データに影響なし |
| 2 | 健康管理Webの `0101`〜`0122`(`0105` は除く) | kenko-kanri | **1回だけ**実行(再実行するとポリシー重複でエラー) |
| 3 | `supabase/hm-stress-link.sql` | ストレスチェックWeb | 連携用の読み取り関数3つ |
| 4 | Vercel の環境変数 `NEXT_PUBLIC_KENKO_URL` を設定 | Vercel | 例: `https://kenko.mestate.jp` |
| 5 | 企業管理で対象企業の「健康管理Web」にチェック | アプリ | 併用する企業のみ |

> 健康管理Web側の `0105_hm_stress_link_template.sql` は、列名がストレスチェックWebの実際の
> スキーマと異なるテンプレートです。**そちらは実行せず**、本リポジトリの
> `supabase/hm-stress-link.sql`(実列名に合わせて完成させたもの)を実行してください。

---

## 3. 0016 で追加するもの

### profiles の別名列

健康管理Webは開発時から `profiles` を `id / full_name / employee_no / department` という
列名で参照する前提で作られています。ストレスチェックWebの実際の列名は
`user_id / name / emp_id / dept` です。

そこで、**既存列から自動生成される別名の列**(生成列)を追加し、両方の名前で読めるようにしました。

| 健康管理Webが使う名前 | 実体 |
|---|---|
| `profiles.id` | `user_id` |
| `profiles.full_name` | `name` |
| `profiles.employee_no` | `emp_id` |
| `profiles.department` | `dept` |

- 生成列のため**書き込みはできず**、値が元の列とずれることはありません。
- 健康管理Web側のテーブルが `profiles(id)` を外部キーで参照するため、`id` に一意制約を付けています。
- この方法により、**健康管理Web側のSQLとコードを一切変更せずに**接続できます。

### companies.hm_enabled

健康管理Webを併用する企業だけ `true` にします(既定は `false`)。

---

## 4. 健康管理Webが参照できる範囲

`supabase/hm-stress-link.sql` の3つの関数だけです。テーブルへの直接アクセスは行いません。

| 関数 | 内容 | 権限 |
|---|---|---|
| `hm_high_stress_list(company_id, fiscal_year)` | 高ストレス者の氏名・社員番号・申出の有無 | 実施者のみ |
| `hm_stress_summary(company_id, fiscal_year)` | 受検者数・高ストレス者数・割合 | 実施者 / 自社の企業・事務従事者 |
| `hm_stress_history(user_id)` | 個人の年度別の高ストレス判定と申出の有無 | 実施者のみ |

- **個人の回答内容(answers)や領域別得点は一切渡しません。**
- `hm_stress_summary` は、**10名未満の場合に人数と率を返しません**(個人特定の防止)。
- いずれの関数も**ストレスチェックWebのアクセスログにも記録**されます
  (`hm_view_high_stress` / `hm_view_stress_history`)。実施者はストレスチェックWebの
  「アクセスログ」画面で、健康管理Web経由の閲覧も含めて追跡できます。

---

## 4-2. ④⑤ 公開と有効化の手順

### 健康管理Web(kenko-kanri)側 — Vercel

1. Vercel で **Add New → Project** → GitHubの `hironoriuematsu-byte/kenko-kanri` を選ぶ
   - デプロイするブランチは `claude/health-management-web-mj4bv5`(Settings → Git → Production Branch)
2. 環境変数(Settings → Environment Variables)

   | 変数名 | 値 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ストレスチェックWebと**同じ値** |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ストレスチェックWebと**同じ値** |
   | `NEXT_PUBLIC_STRESS_URL` | `https://stres.mestate.jp` |

   ※ 健康管理Webはサーバー用キー(service_role)もResendキーも使用しません。
3. 独自ドメイン `kenko.mestate.jp` を追加し、Squarespace のDNSに CNAME を1件登録
   (`stres` と同じ要領。ホスト名は `kenko`)
4. **Deployment Protection** が Production にかかっていないか確認

### Supabase — 認証の設定

Authentication → URL Configuration の **Redirect URLs に健康管理WebのURLを追加**する
(`https://kenko.mestate.jp/**`)。**既存の行は消さない**。
両アプリでアカウントを共有するため、これを行わないと健康管理Web側でのログインや
パスワード再設定のリンクが機能しない。

### ストレスチェックWeb側 — Vercel

環境変数 `NEXT_PUBLIC_KENKO_URL` に健康管理WebのURL(`https://kenko.mestate.jp`)を設定し、
**再デプロイ**する。設定しない限り、ストレスチェックWebに健康管理Webの導線は出ない。

### ⑤ 企業ごとの有効化

ストレスチェックWebの **企業管理** で、健康管理Webも契約している企業の
「健康管理Web 併用する」にチェックを入れる。チェックした企業の画面にのみ導線が出る。

---

## 5. 検証済みの内容(2026-09-07)

ローカルのPostgreSQL 16に本番と同じスキーマ(0001〜0016)を作り、その上で確認しました。

- 健康管理Webの全マイグレーション(0101〜0122)が**エラーなく適用できる**こと
  (Storageバケットの作成のみ、ローカルに `storage` スキーマがないため未検証。本番では問題ありません)
- `hm-stress-link.sql` の3関数が作成でき、**実データで期待どおりの値を返す**こと
  - 高ストレス者一覧に対象者と申出の有無が出る
  - 10名未満のとき、サマリーの人数・率が伏せられる
  - 受検歴が年度降順で返る
- 別名列(id / full_name / employee_no / department)が元の列と一致すること
- ストレスチェックWebのアクセスログに閲覧記録が残ること

---

## 6. 今後の注意

- ストレスチェックWebで `profiles` の `name` / `emp_id` / `dept` / `user_id` の**列名を変更しない**でください
  (別名列の定義が壊れます)。変更が必要な場合は 0016 も同時に更新します。
- 健康管理Web側でストレスチェックのテーブルに**書き込みを行わない**でください。
  結果は5年保存・改変不可が制度上の前提です。
- ストレスチェックWebに健康管理Web前提の機能を追加しないでください。単独提供ができなくなります。
