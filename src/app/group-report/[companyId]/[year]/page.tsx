import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { GroupReportView } from "./GroupReportView";

// 集団分析報告書(印刷・PDF)。閲覧は実施者(office)と自社の実施事務従事者(jimu)のみ。
export default async function GroupReportPage({
  params,
}: {
  params: { companyId: string; year: string };
}) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=/group-report/${params.companyId}/${params.year}`);

  const allowed =
    profile?.role === "office" ||
    (profile?.role === "jimu" && profile.company_id === params.companyId && profile.no_personnel_authority);

  if (!profile || !allowed) {
    if (profile && profile.role !== "office" && profile.role !== "jimu") redirect(roleHome(profile.role));
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 8px" }}>閲覧権限がありません</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7, margin: 0 }}>
          集団分析報告書は実施者、または誓約済みの自社の実施事務従事者のみ閲覧できます。
        </p>
      </Card>
    );
  }

  const supabase = createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", params.companyId)
    .maybeSingle();

  const year = parseInt(params.year, 10);
  if (!company || Number.isNaN(year)) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: 0 }}>企業または年度が見つかりません</h2>
      </Card>
    );
  }

  return <GroupReportView companyId={params.companyId} companyName={company.name} fiscalYear={year} />;
}
