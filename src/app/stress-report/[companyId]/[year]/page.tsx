import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { StressReportForm, type ReportInfo, type ReportSummary } from "./StressReportForm";

// 心理的な負担の程度を把握するための検査結果等報告書(様式第6号の3)の記載項目。
// 労働基準監督署への報告書に転記するための印刷・PDF用画面。
// 閲覧は実施者(office)と自社の実施事務従事者(jimu、誓約済み)のみ(集団分析報告書と同じ)。
export default async function StressReportPage({
  params,
}: {
  params: { companyId: string; year: string };
}) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=/stress-report/${params.companyId}/${params.year}`);

  const allowed =
    profile?.role === "office" ||
    (profile?.role === "jimu" && profile.company_id === params.companyId && profile.no_personnel_authority);

  if (!profile || !allowed) {
    if (profile && profile.role !== "office" && profile.role !== "jimu") redirect(roleHome(profile.role));
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 8px" }}>閲覧権限がありません</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7, margin: 0 }}>
          検査結果等報告書の記載項目は実施者、または誓約済みの自社の実施事務従事者のみ閲覧できます。
        </p>
      </Card>
    );
  }

  const year = parseInt(params.year, 10);
  const supabase = createClient();
  const [{ data: company }, { data: info, error: infoErr }, { data: summary, error: sumErr }] =
    await Promise.all([
      supabase.from("companies").select("name, questionnaire").eq("id", params.companyId).maybeSingle(),
      supabase.from("company_report_info").select("*").eq("company_id", params.companyId).maybeSingle(),
      supabase.rpc("stress_report_summary", { p_company: params.companyId, p_year: year }),
    ]);

  if (!company || Number.isNaN(year)) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: 0 }}>企業または年度が見つかりません</h2>
      </Card>
    );
  }

  // 0021 が未適用のときは、集計と保存ができない旨を画面で案内する
  const notApplied = Boolean(infoErr || sumErr);

  return (
    <StressReportForm
      companyId={params.companyId}
      companyName={company.name}
      fiscalYear={year}
      initialInfo={(info as ReportInfo | null) ?? null}
      summary={(summary as ReportSummary | null) ?? null}
      notApplied={notApplied}
      canEdit={profile.role === "office" || profile.role === "jimu"}
      questionnaire={(company as { questionnaire?: "57" | "80" }).questionnaire === "80" ? "80" : "57"}
    />
  );
}
