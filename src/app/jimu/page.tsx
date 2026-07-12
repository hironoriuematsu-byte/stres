import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { JimuDashboard } from "./JimuDashboard";
import { Attestation } from "./Attestation";

export default async function JimuPage() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/jimu");
  if (!profile || profile.role !== "jimu") redirect(roleHome(profile?.role));

  // 未誓約の実施事務従事者はRLSにより結果が0件になるため、先に誓約画面へ誘導(仕様1)
  if (!profile.no_personnel_authority) {
    return <Attestation />;
  }

  const supabase = createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, code")
    .eq("id", profile.company_id!)
    .single();

  return (
    <JimuDashboard
      companyId={profile.company_id!}
      companyName={company?.name ?? "自社"}
    />
  );
}
