import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { MyPage } from "./MyPage";

export default async function My() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/my");
  if (!profile || profile.role !== "employee") redirect(roleHome(profile?.role));

  return <MyPage name={profile.name} companyId={profile.company_id!} />;
}
