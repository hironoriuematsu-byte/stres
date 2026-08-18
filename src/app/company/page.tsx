import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

// 事業者担当者(company)ロールは現在の運用では使用しない。
// 誤ってこのロールのアカウントが存在した場合の案内のみ表示する。
export default async function CompanyPage() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/company");
  if (profile && profile.role !== "company") redirect(roleHome(profile.role));

  return (
    <Card style={{ maxWidth: 560, margin: "0 auto" }}>
      <Badge tone="gray">事業者担当者</Badge>
      <h2 style={{ fontSize: 18, color: brand.ink, margin: "12px 0 8px" }}>
        この区分は現在ご利用いただけません
      </h2>
      <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: 0 }}>
        現在の運用では、結果の管理は実施事務従事者アカウントに統一されています。集団分析や結果の確認が必要な場合は、実施者(産業医 上松 弘典)までお問い合わせください。
      </p>
    </Card>
  );
}
