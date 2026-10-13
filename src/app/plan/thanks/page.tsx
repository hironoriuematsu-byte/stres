import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";

export const metadata = { title: "お申込み完了 | ストレスチェックWeb" };

export default function ThanksPage() {
  const p = { fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "0 0 10px" } as const;
  return (
    <Card style={{ maxWidth: 640, margin: "0 auto" }}>
      <Badge>お支払い完了</Badge>
      <h1 style={{ fontSize: 21, color: brand.ink, margin: "12px 0 10px" }}>お申込みありがとうございます</h1>
      <p style={p}>
        お支払いを受け付けました。数分以内に、ご担当者さまのメールアドレスへ次のメールが届きます。
      </p>
      <ul style={{ ...p, paddingLeft: 20 }}>
        <li>招待メール(ログイン用のパスワードの設定)</li>
        <li>お申込み内容と、受検の準備のご案内</li>
        <li>領収書(決済代行会社 Stripe から)</li>
      </ul>
      <p style={p}>
        パスワードを設定してログインすると、受検用のURL・QRコードを従業員の皆さまにお知らせできます。
        受検期間が始まる前に、実施の目的・期間・結果の取扱いを従業員の皆さまに周知してください。
      </p>
      <p style={{ ...p, fontSize: 13, color: "#5B6B6A" }}>
        30分たってもメールが届かない場合は、迷惑メールフォルダをご確認のうえ、{SELLER.email} までご連絡ください。
      </p>
      <Link href="/login" style={{ display: "inline-block", background: brand.teal, color: "#fff", borderRadius: 10, padding: "10px 22px", fontWeight: 700, textDecoration: "none" }}>
        ログイン画面へ
      </Link>
    </Card>
  );
}
