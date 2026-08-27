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
  const { data: companies } = await supabase.from("companies").select("id, name, code, questionnaire").order("name");

  return <OfficeDashboard companies={(companies as Company[]) ?? []} />;
}
