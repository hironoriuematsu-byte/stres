import { redirect } from "next/navigation";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { ExamForm } from "./ExamForm";

export default async function ExamPage() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/exam");
  if (!profile) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink }}>プロフィール未登録</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7 }}>
          アカウントにプロフィールが登録されていません。実施者(産業医事務所)にお問い合わせください。
        </p>
      </Card>
    );
  }
  if (profile.role !== "employee") redirect(roleHome(profile.role));

  const supabase = createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", profile.company_id!)
    .single();

  return (
    <ExamForm
      profile={{
        userId: profile.user_id,
        name: profile.name === "未設定" ? "" : profile.name,
        empId: profile.emp_id ?? "",
        dept: profile.dept ?? "",
        companyId: profile.company_id!,
        companyName: company?.name ?? "",
      }}
    />
  );
}
