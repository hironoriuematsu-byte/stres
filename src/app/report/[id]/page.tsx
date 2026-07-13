import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { ReportView } from "./ReportView";

// 個人結果票。閲覧可否はRLSに委ねる:
//   本人=自分の結果のみ / office=全件 / jimu=自社(誓約済)のみ
export default async function ReportPage({ params }: { params: { id: string } }) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=/report/${params.id}`);

  // 「戻る」の代わりに、閲覧者のロールに応じた固定の行き先を用意する
  // (ブラウザ履歴で戻ると受検フローの途中に戻ってしまうため)
  const backHref = roleHome(profile?.role);
  const backLabel = profile?.role === "employee" ? "マイページへ" : "ダッシュボードへ";

  const supabase = createClient();
  const { data: result } = await supabase
    .from("results")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!result) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 8px" }}>結果が見つかりません</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7, margin: 0 }}>
          この結果票は存在しないか、閲覧権限がありません。
        </p>
      </Card>
    );
  }

  const [{ data: subject }, { data: company }] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, emp_id")
      .eq("user_id", result.user_id)
      .maybeSingle(),
    supabase.from("companies").select("name").eq("id", result.company_id).maybeSingle(),
  ]);

  return (
    <ReportView
      result={result}
      subjectName={subject?.name ?? "(不明)"}
      subjectEmpId={subject?.emp_id ?? ""}
      companyName={company?.name ?? ""}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}
