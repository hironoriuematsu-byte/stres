import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { CompanyDashboard } from "./CompanyDashboard";

export default async function CompanyPage() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/company");
  if (!profile || profile.role !== "company") redirect(roleHome(profile?.role));

  const supabase = createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, code")
    .eq("id", profile.company_id!)
    .single();

  return <CompanyDashboard companyId={profile.company_id!} companyName={company?.name ?? "自社"} />;
}
