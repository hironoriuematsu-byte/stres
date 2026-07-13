import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { getFiscalYear } from "@/lib/fiscal";
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
  const fiscalYear = getFiscalYear();
  const [{ data: company }, { data: existing }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", profile.company_id!).single(),
    // 年度内1回の原則: 当年度の受検が既にあればフォームを表示しない
    supabase
      .from("results")
      .select("id")
      .eq("user_id", profile.user_id)
      .eq("fiscal_year", fiscalYear)
      .maybeSingle(),
  ]);

  if (existing) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <Badge tone="orange">受検済み</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 8px" }}>
          {fiscalYear}年度は受検済みです
        </h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, marginBottom: 16 }}>
          ストレスチェックは年度内に1回の受検が原則です。結果はマイページからいつでも確認できます。誤って回答したためやり直したい場合は、会社の実施事務従事者または実施者にお申し出ください。
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Link href={`/report/${existing.id}`}>
            <Btn tone="ghost">結果票を見る</Btn>
          </Link>
          <Link href="/my">
            <Btn>マイページへ</Btn>
          </Link>
        </div>
      </Card>
    );
  }

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
