import { NextResponse } from "next/server";
import { getFiscalYear } from "@/lib/fiscal";
import { staffContext } from "@/lib/no-email-server";
import { calcScores, type Answers } from "@/lib/questionnaire";
import { cleanFlat, flatComplete, flatMissing, flatToAnswers } from "@/lib/paper";

export const runtime = "nodejs";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

// 紙の回答を結果として登録する(実施者・誓約済みの実施事務従事者)。
// 採点と高ストレスの判定はWeb受検と同じ計算。登録後はWeb受検の結果と同じ扱いになる
export async function POST(req: Request) {
  let body: { companyId?: unknown; userId?: unknown; flat?: unknown; dept?: unknown; gender?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const ctx = await staffContext(req, companyId);
  if (!ctx.ok) return fail(ctx.status, ctx.error);
  const { admin } = ctx;

  const userId = typeof body.userId === "string" ? body.userId : "";
  const [{ data: prof }, { data: company }] = await Promise.all([
    admin.from("profiles").select("user_id, name, dept, role, company_id").eq("user_id", userId).maybeSingle(),
    admin.from("companies").select("questionnaire").eq("id", companyId).maybeSingle(),
  ]);
  if (!prof || prof.company_id !== companyId || (prof.role !== "employee" && prof.role !== "jimu")) return fail(404, "対象の方が見つかりません");
  if (!prof.name || prof.name === "未設定") return fail(400, "氏名が登録されていない方です。先に氏名を登録してください");

  const questionnaire = company?.questionnaire === "80" ? "80" : "57";
  const flat = cleanFlat(body.flat, questionnaire);
  if (!flatComplete(flat, questionnaire)) {
    const missing = flatMissing(flat, questionnaire);
    return fail(400, `回答が入っていない設問があります(設問 ${missing.slice(0, 10).join("・")}${missing.length > 10 ? " ほか" : ""})`);
  }
  const gender = body.gender === "male" || body.gender === "female" ? body.gender : null;
  if (!gender) return fail(400, "性別を選んでください(尺度の評価に使います)");
  const dept = (typeof body.dept === "string" ? body.dept.trim().slice(0, 100) : "") || prof.dept || "";
  if (!dept) return fail(400, "部署を入力してください");

  const fiscalYear = getFiscalYear();
  const { data: existing } = await admin.from("results").select("id").eq("user_id", userId).eq("fiscal_year", fiscalYear).maybeSingle();
  if (existing) return fail(409, `${fiscalYear}年度はすでに受検済みです(結果一覧をご確認ください)`);

  const { answers, ext } = flatToAnswers(flat, questionnaire);
  const scores = calcScores(answers as Answers);
  const { data: inserted, error } = await admin
    .from("results")
    .insert({
      user_id: userId,
      company_id: companyId,
      dept,
      fiscal_year: fiscalYear,
      answers,
      gender,
      score_a: scores.A,
      score_b: scores.B,
      score_c: scores.C,
      score_d: scores.D,
      high_stress: scores.highStress,
      // 会社への提供の同意は、本人が結果を見たあとにもらう(受検のときにはもらわない)。同意書を受け取ってから記録する
      consent: false,
      questionnaire,
      answers_ext: ext,
      exam_method: "paper",
      entered_by: ctx.userId,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    const msg = error?.message ?? "unknown";
    if (/exam_method|entered_by/.test(msg)) return fail(503, "準備がまだです(SQL 0034 を実行してください)");
    // Web申込の企業の受検期間・人数枠(データベース側の決まり)のメッセージはそのまま出す
    return fail(400, `登録できませんでした: ${msg}`);
  }
  if (dept !== prof.dept) await admin.from("profiles").update({ dept }).eq("user_id", userId);
  await admin.from("access_logs").insert({ user_id: ctx.userId, role: ctx.role, action: "paper_result_registered", target: inserted.id, company_id: companyId });
  return NextResponse.json({ ok: true, resultId: inserted.id, highStress: scores.highStress });
}
