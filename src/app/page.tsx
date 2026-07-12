import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { Card, Badge } from "@/components/ui";
import { brand } from "@/lib/brand";

export default async function Home() {
  const { user, profile } = await getSessionProfile();

  if (user && profile) {
    redirect(roleHome(profile.role));
  }

  // ログイン済みだがプロフィール未登録(登録処理の失敗など)の場合の案内
  if (user && !profile) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <Badge tone="orange">アカウント設定が未完了です</Badge>
        <h1 style={{ fontSize: 19, color: brand.ink, margin: "12px 0 8px" }}>
          プロフィールが登録されていません
        </h1>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: 0 }}>
          ログインは成功しましたが、アカウントに所属企業・役割の情報が登録されていないため、画面を表示できません。お手数ですが、会社のストレスチェック担当者または実施者(うえまつ産業医事務所)に、このメールアドレス({user.email})のプロフィール登録を依頼してください。
        </p>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <Card>
        <Badge>うえまつ産業医事務所</Badge>
        <h1 style={{ fontSize: 21, color: brand.ink, margin: "12px 0 8px" }}>
          ストレスチェックWeb
        </h1>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 16px" }}>
          厚生労働省「職業性ストレス簡易調査票(57項目)」に準拠したストレスチェックシステムです。アカウントは実施者(産業医事務所)からの招待により発行されます。招待メールが届いている方は、メール内のリンクからパスワードを設定のうえログインしてください。
        </p>
        <Link href="/login">
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
            ログイン
          </button>
        </Link>
      </Card>
      <p style={{ fontSize: 12, color: "#8A9694", lineHeight: 1.8, marginTop: 14, padding: "0 4px" }}>
        通信はTLSで暗号化され、結果データはSupabase(東京リージョン)に保存時暗号化(AES-256)の上で保管されます。個人結果の閲覧範囲は労働安全衛生法第66条の10に基づき、データベースの行レベルセキュリティで制御されています。
      </p>
    </div>
  );
}
