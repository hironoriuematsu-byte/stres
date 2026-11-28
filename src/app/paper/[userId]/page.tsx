import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { adminClient } from "@/lib/plan-server";
import { staffPageRole } from "@/lib/no-email-server";
import { paperReadConfigured } from "@/lib/paper-server";
import { getFiscalYear } from "@/lib/fiscal";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { PaperEntry } from "./PaperEntry";

export const metadata = { title: "紙の回答の登録", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// 紙の回答用紙に書かれた回答を登録する画面(実施者・誓約済みの実施事務従事者)
export default async function PaperEntryPage({ params }: { params: { userId: string } }) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=/paper/${params.userId}`);
  const admin = adminClient();
  if (!admin) redirect(roleHome(profile?.role));
  const { data: target } = await admin.from("profiles").select("user_id, name, dept, role, company_id").eq("user_id", params.userId).maybeSingle();
  const companyId = (target?.company_id as string | null) ?? "";
  const role = companyId ? await staffPageRole(companyId) : null;
  if (!target || !role || (target.role !== "employee" && target.role !== "jimu")) redirect(roleHome(profile?.role));

  const fy = getFiscalYear();
  const back = role === "office" ? `/office?tab=noemail&c=${companyId}` : "/jimu?tab=noemail";
  const [{ data: company }, { data: depts }, { data: existing }] = await Promise.all([
    admin.from("companies").select("name, questionnaire").eq("id", companyId).maybeSingle(),
    admin.from("departments").select("name").eq("company_id", companyId).order("sort_order").order("name"),
    admin.from("results").select("id").eq("user_id", params.userId).eq("fiscal_year", fy).maybeSingle(),
  ]);

  if (existing) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 8px" }}>{target.name}さんは、{fy}年度は受検済みです</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>同じ年度に2回は登録できません。登録をやり直すときは、結果一覧の「再受検」で前の結果を取り消してから、もう一度登録してください。</p>
        <div style={{ display: "flex", gap: 16, fontSize: 14, fontWeight: 700 }}>
          <Link href={`/report/${existing.id}`} style={{ color: brand.tealDark }}>結果票を開く →</Link>
          <Link href={back} style={{ color: brand.tealDark }}>ダッシュボードへ</Link>
        </div>
      </Card>
    );
  }

  return (
    <PaperEntry
      companyId={companyId}
      companyName={company?.name ?? ""}
      questionnaire={company?.questionnaire === "80" ? "80" : "57"}
      fiscalYear={fy}
      userId={params.userId}
      name={target.name && target.name !== "未設定" ? (target.name as string) : ""}
      initialDept={(target.dept as string | null) ?? ""}
      depts={(depts ?? []).map((d) => d.name as string)}
      aiReady={paperReadConfigured()}
      backHref={back}
    />
  );
}
