import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";

export const metadata = { title: "継続してご利用の企業さま | ストレスチェックWeb" };

// 2年目以降(継続利用)の企業向けの案内。新規の申込から入ると別の企業として作られてしまうため、
// 宣伝ページ・申込フォームの目立つ位置からここへ案内する
export default function ContinuePage() {
  const p = { fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "0 0 8px" } as const;
  const li = { fontSize: 14, color: "#44534F", lineHeight: 1.9 } as const;
  return (
    <Card style={{ maxWidth: 680, margin: "0 auto" }}>
      <Badge>継続してご利用の企業さま</Badge>
      <h1 style={{ fontSize: 21, color: brand.ink, margin: "12px 0 8px" }}>2年目以降のお申込み</h1>
      <p style={p}>
        以前このサービスをご利用いただいた企業さまは、<strong>新規のお申込みではなく、ご担当者さまのログイン後の画面から</strong>
        お申し込みください。従業員の皆さまのアカウントと過去の結果がそのまま引き継がれ、従業員の皆さまの登録し直しも不要です。
      </p>
      <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
        <li style={li}>ご担当者さまのメールアドレスとパスワードでログインします</li>
        <li style={li}>メニュー画面の「次の年度のお申込み」から、人数・受検期間を入れてお支払いください</li>
        <li style={li}>昨年度受検した従業員の皆さまは、これまでのアカウントでそのまま受検できます</li>
      </ol>
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
          <strong>ご担当者さまが変わった・退職した：</strong>{SELLER.email} までご連絡ください。新しいご担当者さまをお招きします
          (会社名と、新しいご担当者さまのお名前・メールアドレスをお知らせください)。
        </li>
        <li style={li}>
          <strong>間違えて新規で申し込んでしまった：</strong>{SELLER.email} までご連絡ください。こちらで元の企業にまとめます
          (お支払いはそのまま有効で、従業員の皆さまの受検結果も元の企業に移ります)。
        </li>
      </ul>
    </Card>
  );
}
