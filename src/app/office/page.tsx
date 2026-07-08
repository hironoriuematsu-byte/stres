import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { OfficeTable, ResultRow } from "./OfficeTable";

export default async function OfficePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/office");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (profile?.role !== "office") {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 8px" }}>アクセス権がありません</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7 }}>
          このページは産業医事務所(office)ロールのアカウントのみ閲覧できます。ロールの付与については管理者にお問い合わせください。
        </p>
      </Card>
    );
  }

  const { data: rows } = await supabase
    .from("results")
    .select("id, taken_at, full_name, employee_no, department, score_a, score_b, score_c, score_ac, high_stress, consent_to_company")
    .order("taken_at", { ascending: false });

  return <OfficeTable rows={(rows as ResultRow[]) ?? []} />;
}
