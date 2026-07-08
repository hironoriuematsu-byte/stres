import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, brand } from "@/components/ui";

export default async function Home() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Card style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 13,
            color: "#8A6B2E",
            background: "#FBF3E3",
            border: "1px solid #EFD9A8",
            borderRadius: 10,
            padding: "10px 14px",
            lineHeight: 1.7,
          }}
        >
          ⚠️
          結果はSupabase上のデータベースに保存され、行レベルセキュリティ(RLS)により本人・実施者・(同意時のみ)企業人事担当者のみが閲覧できます。取り扱いには十分ご注意ください。
        </div>
      </Card>
      <div style={{ display: "grid", gap: 14 }}>
        <Card>
          <Badge>従業員の方</Badge>
          <h2 style={{ fontSize: 19, margin: "10px 0 6px", color: brand.ink }}>ストレスチェックを受検する</h2>
          <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 14px" }}>
            厚生労働省「職業性ストレス簡易調査票(57項目)」に回答します。所要時間は約10分。結果はその場で表示され、あなた本人と実施者(産業医事務所)のみが確認できます。会社への結果提供は、あなたが同意した場合に限られます。
          </p>
          <Link href={user ? "/exam" : "/login?next=/exam"}>
            <button
              style={{
                background: brand.teal,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "11px 22px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              受検を開始する
            </button>
          </Link>
          {!user && (
            <span style={{ marginLeft: 12, fontSize: 13, color: "#5B6B6A" }}>
              初めての方は
              <Link href="/signup" style={{ color: brand.tealDark, fontWeight: 700 }}>
                アカウント作成
              </Link>
              が必要です
            </span>
          )}
        </Card>
        <Card>
          <Badge tone="orange">産業医事務所(実施者)</Badge>
          <h2 style={{ fontSize: 19, margin: "10px 0 6px", color: brand.ink }}>実施者ダッシュボード</h2>
          <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 14px" }}>
            全受検者の結果と高ストレス者の一覧を確認できます(事務所アカウントでのログインが必要)。
          </p>
          <Link href="/office">
            <button
              style={{
                background: brand.orange,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "11px 22px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              事務所としてログイン
            </button>
          </Link>
        </Card>
        <Card>
          <Badge tone="gray">企業の人事担当者</Badge>
          <h2 style={{ fontSize: 19, margin: "10px 0 6px", color: brand.ink }}>企業担当者ダッシュボード</h2>
          <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 14px" }}>
            本人が提供に同意した個人結果と、部署別の集団分析を確認できます(企業アカウントでのログインが必要)。同意のない個人結果は労働安全衛生法第66条の10により閲覧できません。
          </p>
          <Link href="/company">
            <button
              style={{
                background: "#fff",
                color: brand.tealDark,
                border: `1px solid ${brand.teal}`,
                borderRadius: 10,
                padding: "11px 22px",
                fontSize: 15,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              企業担当者としてログイン
            </button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
