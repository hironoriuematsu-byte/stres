import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile, roleHome } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { getFiscalYear } from "@/lib/fiscal";
import { ExamForm } from "./ExamForm";
import { fetchBirthDate } from "@/lib/birth-date-db";
import { formatJpDate, jstToday } from "@/lib/plan";

export default async function ExamPage() {
  const { user, profile } = await getSessionProfile();

  if (!user) redirect("/login?next=/exam");
  if (!profile) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <h2 style={{ fontSize: 18, color: brand.ink }}>プロフィール未登録</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7 }}>
          アカウントにプロフィールが登録されていません。実施者(産業医)にお問い合わせください。
        </p>
      </Card>
    );
  }
  // 従業員に加えて実施事務従事者も自分のアカウントで受検できる
  if (profile.role !== "employee" && profile.role !== "jimu") redirect(roleHome(profile.role));

  const supabase = createClient();
  const fiscalYear = getFiscalYear();
  const [{ data: company }, { data: existing }, { data: depts }, birth] = await Promise.all([
    supabase.from("companies").select("name, questionnaire").eq("id", profile.company_id!).single(),
    // 年度内1回の原則: 当年度の受検が既にあればフォームを表示しない
    supabase
      .from("results")
      .select("id")
      .eq("user_id", profile.user_id)
      .eq("fiscal_year", fiscalYear)
      .maybeSingle(),
    // 部署の選択肢(未登録の場合は直接入力になる)
    supabase
      .from("departments")
      .select("name")
      .eq("company_id", profile.company_id!)
      .order("sort_order")
      .order("name"),
    // 生年月日(健康管理Webとの突合用。SQL 0024 未実行なら supported=false)
    fetchBirthDate(supabase, profile.user_id),
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

  // Web申込の企業は、受検期間内かつ人数枠の範囲でのみ受検できる(データベース側でも同じ条件で止める: 0025)
  const block = await examPlanBlock(supabase, profile.company_id!, fiscalYear);
  if (block) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <Badge tone="orange">{block.badge}</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 8px" }}>{block.title}</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, marginBottom: 16 }}>{block.text}</p>
        <Link href="/my">
          <Btn>マイページへ</Btn>
        </Link>
      </Card>
    );
  }

  return (
    <ExamForm
      profile={{
        userId: profile.user_id,
        name: profile.name === "未設定" ? "" : profile.name,
        dept: profile.dept ?? "",
        birthDate: birth.value ?? "",
        birthDateSupported: birth.supported,
        companyId: profile.company_id!,
        companyName: company?.name ?? "",
      }}
      departments={((depts as { name: string }[]) ?? []).map((d) => d.name)}
      questionnaire={company?.questionnaire === "80" ? "80" : "57"}
    />
  );
}

type PlanRow = { seats: number; used: number; exam_start: string; exam_end: string };

async function examPlanBlock(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  fiscalYear: number
): Promise<{ badge: string; title: string; text: string } | null> {
  const [{ data: plans, error }, { data: company }] = await Promise.all([
    supabase.from("exam_plans").select("fiscal_year").eq("company_id", companyId),
    supabase.from("companies").select("web_signup").eq("id", companyId).maybeSingle(),
  ]);
  const web = Boolean((company as { web_signup?: boolean } | null)?.web_signup);
  // 選任・顧問契約の企業(Web申込から切り替えた企業を含む)は制限しない。SQL 0025 未実行のときも制限しない
  if (error || !web) return null;
  void plans;
  const { data } = await supabase.rpc("exam_plan_status", { p_company: companyId, p_year: fiscalYear });
  const row = (data as PlanRow[] | null)?.[0];
  const today = jstToday();
  if (!row) {
    return { badge: "受検期間外", title: "現在は受検期間ではありません", text: "受検期間は、会社のストレスチェック担当者にご確認ください。" };
  }
  if (today < row.exam_start) {
    return {
      badge: "受検期間前",
      title: `受検は${formatJpDate(row.exam_start)}からです`,
      text: `受検期間は${formatJpDate(row.exam_start)}〜${formatJpDate(row.exam_end)}です。期間になってから、もう一度このページを開いてください。`,
    };
  }
  if (today > row.exam_end) {
    return {
      badge: "受検期間終了",
      title: "受検期間は終了しました",
      text: `受検期間(${formatJpDate(row.exam_end)}まで)は終了しました。受検が必要な場合は、会社のストレスチェック担当者にご連絡ください。`,
    };
  }
  if (row.used >= row.seats) {
    return {
      badge: "受検人数の上限",
      title: "申込人数に達しています",
      text: "会社がお申込みの受検人数に達したため、現在は受検できません。会社のストレスチェック担当者に、人数の追加をご依頼ください。",
    };
  }
  return null;
}
