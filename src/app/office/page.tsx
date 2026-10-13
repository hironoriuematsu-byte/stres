import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { Company } from "@/lib/types";
import { OfficeDashboard } from "./OfficeDashboard";

export default async function OfficePage() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/office");
  if (!profile || profile.role !== "office") redirect(roleHome(profile?.role));

  const supabase = createClient();
  // web_signup は SQL 0025 で追加される列。未実行の環境では付けずに読み直す
  let { data: companies, error: compErr } = await supabase
    .from("companies")
    .select("id, name, code, questionnaire, hm_enabled, web_signup")
    .order("name");
  if (compErr) {
    const { data: fallback } = await supabase.from("companies").select("id, name, code, questionnaire, hm_enabled").order("name");
    companies = (fallback ?? []).map((c) => ({ ...c, web_signup: false }));
  }

  return <OfficeDashboard companies={(companies as Company[]) ?? []} />;
}
