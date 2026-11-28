import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { adminClient } from "@/lib/plan-server";
import { staffPageRole } from "@/lib/no-email-server";
import { getFiscalYear } from "@/lib/fiscal";
import { formatLoginId } from "@/lib/no-email";
import { PaperSheet } from "@/components/PaperSheet";

export const metadata = { title: "紙の回答用紙", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// 紙の回答用紙・同意書の印刷(実施者・誓約済みの実施事務従事者)。
//   c=企業 / u=受検者(指定すると氏名・部署・整理番号が入る) / kind=consent で同意書
export default async function PaperSheetPage({ searchParams }: { searchParams: { c?: string; u?: string; kind?: string } }) {
  const companyId = searchParams.c ?? "";
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login");
  const role = await staffPageRole(companyId);
  const admin = adminClient();
  if (!role || !admin) redirect(roleHome(profile?.role));

  const [{ data: company }, person] = await Promise.all([
    admin.from("companies").select("name, questionnaire").eq("id", companyId).maybeSingle(),
    searchParams.u
      ? admin.from("profiles").select("*").eq("user_id", searchParams.u).eq("company_id", companyId).maybeSingle().then((r) => r.data as Record<string, unknown> | null)
      : Promise.resolve(null),
  ]);
  if (!company) redirect(roleHome(profile?.role));
  const questionnaire = company.questionnaire === "80" ? "80" : "57";
  const fy = getFiscalYear();
  const name = person && person.name !== "未設定" ? String(person.name ?? "") : "";
  const dept = person ? String(person.dept ?? "") : "";
  const loginId = person?.login_id ? formatLoginId(String(person.login_id)) : "";
  const birth = String((person?.id_birth_date as string | null) ?? (person?.birth_date as string | null) ?? "");
  const birthLabel = /^\d{4}-\d{2}-\d{2}$/.test(birth) ? `${Number(birth.slice(0, 4))}年 ${Number(birth.slice(5, 7))}月 ${Number(birth.slice(8, 10))}日` : "";
  const back = role === "office" ? `/office?tab=noemail&c=${companyId}` : "/jimu?tab=noemail";
  const isConsent = searchParams.kind === "consent";

  return <PaperSheet company={{ name: company.name as string }} questionnaire={questionnaire} fy={fy} name={name} dept={dept} loginId={loginId} birthLabel={birthLabel} back={back} isConsent={isConsent} />;
}
