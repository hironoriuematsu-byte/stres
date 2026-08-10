import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { MyPage } from "./MyPage";

export default async function My() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/my");
  // 従業員に加えて実施事務従事者も自分の受検・結果の確認ができる
  if (!profile || (profile.role !== "employee" && profile.role !== "jimu")) redirect(roleHome(profile?.role));

  const supabase = createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", profile.company_id!)
    .single();

  return (
    <MyPage
      name={profile.name === "未設定" ? "" : profile.name}
      companyId={profile.company_id!}
      companyName={company?.name ?? ""}
    />
  );
}
