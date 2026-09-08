import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { KenkoLink } from "@/components/KenkoLink";
import { brand } from "@/lib/brand";

// 事業者担当者(company)ロール。
// 健康管理Webを併用する企業のご担当者に発行する。ストレスチェックの
// 個人結果は本人の同意があるものに限られるため、この画面では結果を扱わず、
// 健康管理Webへの導線と問い合わせ先の案内のみを表示する。
export default async function CompanyPage() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/company");
  if (profile && profile.role !== "company") redirect(roleHome(profile.role));

  const supabase = createClient();
  const { data: company } = profile?.company_id
    ? await supabase
        .from("companies")
        .select("name, hm_enabled")
        .eq("id", profile.company_id)
        .maybeSingle()
    : { data: null };

  const hmEnabled = Boolean(company?.hm_enabled);

  return (
    <Card style={{ maxWidth: 620, margin: "0 auto" }}>
      <Badge tone="gray">事業者担当者</Badge>
      <h2 style={{ fontSize: 19, color: brand.ink, margin: "12px 0 8px" }}>
        {company?.name ?? "自社"}
      </h2>

      {hmEnabled ? (
        <>
          <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.9, margin: "0 0 16px" }}>
            衛生委員会議事録・健康診断・産業医面談・職場巡視などの管理は、健康管理Webで行います。
            下のボタンからお進みください(ログインは共有しているため、そのままご利用いただけます)。
          </p>
          <KenkoLink enabled label="健康管理Webを開く" />
          <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.9, margin: "18px 0 0" }}>
            ストレスチェックの結果については、実施者(産業医 上松 弘典)または実施事務従事者から
            ご提供します。個人の結果は、ご本人の同意がある場合に限りご覧いただけます。
          </p>
        </>
      ) : (
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.9, margin: 0 }}>
          このアカウントでご覧いただける情報はありません。ストレスチェックの結果については、
          実施者(産業医 上松 弘典)または実施事務従事者までお問い合わせください。
        </p>
      )}
    </Card>
  );
}
