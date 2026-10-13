import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";

export const metadata = { title: "ご登録済みの企業さま | ストレスチェックWeb" };

// 2年目以降(ご登録済み)の企業向けの案内。お申込みはログイン後の画面で、毎年同じ操作で行う
export default function ContinuePage() {
  const p = { fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "0 0 8px" } as const;
  const li = { fontSize: 14, color: "#44534F", lineHeight: 1.9 } as const;
  return (
    <Card style={{ maxWidth: 680, margin: "0 auto" }}>
      <Badge>ご登録済みの企業さま</Badge>
      <h1 style={{ fontSize: 21, color: brand.ink, margin: "12px 0 8px" }}>2年目以降のお申込み</h1>
      <p style={p}>
        会社の登録は最初の1回だけです。2年目以降は、ご担当者さまがログインして、1年目と同じ画面からお申し込みください。
        従業員の皆さまのアカウントと過去の結果はそのまま引き継がれます。更新の時期が近づくと、ご案内メールもお送りします。
      </p>
      <Link
        href="/login?next=/jimu"
        style={{ display: "inline-block", background: brand.teal, color: "#fff", borderRadius: 10, padding: "10px 22px", fontWeight: 700, textDecoration: "none" }}
      >
        ログインして申し込む
      </Link>

      <h2 style={{ fontSize: 16, color: brand.tealDark, margin: "22px 0 6px" }}>こんなときは</h2>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        <li style={li}>
          <strong>パスワードを忘れた：</strong>ログイン画面の「パスワードを忘れた方」から設定し直せます。
        </li>
        <li style={li}>
          <strong>ご担当者さまが変わる：</strong>今のご担当者さまが、ログイン後の画面の「従業員招待」から新しいご担当者さまを追加できます。
        </li>
        <li style={li}>
          <strong>ログインできる方がいない(前任者が退職した など)：</strong>{SELLER.email} までご連絡ください。新しいご担当者さまをお招きします
          (会社名・事業場名と、新しいご担当者さまのお名前・メールアドレスをお知らせください)。
        </li>
      </ul>
    </Card>
  );
}
