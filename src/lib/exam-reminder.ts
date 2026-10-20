import type { SupabaseClient } from "@supabase/supabase-js";
import { getFiscalYear } from "@/lib/fiscal";
import { formatJpDate, jstToday } from "@/lib/plan";
import { sendMails } from "@/lib/plan-server";

// ============================================================
// 受検を始めたのに回答を送っていない人への催促(1回だけ)
//   受検の画面を開いた日時を exam_attempts に記録し(SQL 0031)、
//   開いてから EXAM_REMIND_AFTER_DAYS 日たっても当年度の結果がない人に、毎日のお知らせ処理から1回だけメールを送る。
//   回答は途中で保存されないため、途中でやめた人も「結果がない人」に含まれる
// ============================================================

export const EXAM_REMIND_AFTER_DAYS = 3;

export type ExamAttempt = { user_id: string; fiscal_year: number; company_id: string; started_at: string; reminded_at: string | null };

// 催促するか: 開いてから日数がたち、まだ送っておらず、結果がなく、受検期間(Web申込の企業のみ)が終わっていない
export function shouldRemindExam(
  a: Pick<ExamAttempt, "started_at" | "reminded_at">,
  hasResult: boolean,
  now: Date,
  examEnd: string | null
): boolean {
  if (a.reminded_at || hasResult) return false;
  if (now.getTime() - new Date(a.started_at).getTime() < EXAM_REMIND_AFTER_DAYS * 86_400_000) return false;
  if (examEnd && jstToday(now) > examEnd) return false;
  return true;
}

// 受検の画面を開いたことを記録する(同じ年度は最初の1回だけ)。SQL 0031 未実行などで失敗しても受検は止めない
export async function recordExamStart(admin: SupabaseClient, userId: string, fiscalYear: number, companyId: string): Promise<void> {
  const { error } = await admin
    .from("exam_attempts")
    .upsert({ user_id: userId, fiscal_year: fiscalYear, company_id: companyId }, { onConflict: "user_id,fiscal_year", ignoreDuplicates: true });
  if (error) console.warn("exam_attempts の記録に失敗(SQL 0031 未実行の可能性)", error.message);
}

// 毎日のお知らせ処理から呼ぶ。送った件数を返す
export async function sendExamReminders(admin: SupabaseClient, origin: string, now: Date = new Date()): Promise<number> {
  const fy = getFiscalYear();
  const { data: rows, error } = await admin.from("exam_attempts").select("*").eq("fiscal_year", fy).is("reminded_at", null);
  if (error || !rows || rows.length === 0) return 0;
  const attempts = rows as ExamAttempt[];
  const userIds = attempts.map((a) => a.user_id);
  const companyIds = [...new Set(attempts.map((a) => a.company_id))];

  const [{ data: results }, { data: companies }, { data: plans }, { data: profiles }] = await Promise.all([
    admin.from("results").select("user_id").eq("fiscal_year", fy).in("user_id", userIds),
    admin.from("companies").select("id, web_signup, questionnaire").in("id", companyIds),
    admin.from("exam_plans").select("company_id, exam_end, seats").eq("fiscal_year", fy).in("company_id", companyIds),
    admin.from("profiles").select("user_id, name, role, company_id").in("user_id", userIds),
  ]);
  const done = new Set((results ?? []).map((r) => r.user_id as string));
  const companyOf = new Map((companies ?? []).map((c) => [c.id as string, c as { web_signup: boolean; questionnaire: string | null }]));
  const planOf = new Map((plans ?? []).map((p) => [p.company_id as string, p as { exam_end: string; seats: number }]));
  const profileOf = new Map((profiles ?? []).map((p) => [p.user_id as string, p as { name: string | null; role: string; company_id: string | null }]));

  let sent = 0;
  for (const a of attempts) {
    const co = companyOf.get(a.company_id);
    const prof = profileOf.get(a.user_id);
    // 退職などでアカウントの所属が変わった人には送らない
    if (!co || !prof || prof.company_id !== a.company_id || (prof.role !== "employee" && prof.role !== "jimu")) continue;
    const plan = co.web_signup ? planOf.get(a.company_id) : undefined;
    if (co.web_signup) {
      if (!plan) continue;
      // 人数枠がいっぱいなら受検できないので送らない
      const { count } = await admin.from("results").select("id", { count: "exact", head: true }).eq("company_id", a.company_id).eq("fiscal_year", fy);
      if ((count ?? 0) >= plan.seats) continue;
    }
    if (!shouldRemindExam(a, done.has(a.user_id), now, plan?.exam_end ?? null)) continue;

    // 二重に送らないよう、先に「送った」と記録する(ほかの処理が先に記録していたら送らない)
    const { data: claimed } = await admin
      .from("exam_attempts")
      .update({ reminded_at: now.toISOString() })
      .eq("user_id", a.user_id)
      .eq("fiscal_year", fy)
      .is("reminded_at", null)
      .select("user_id");
    if (!claimed || claimed.length === 0) continue;

    const { data: u } = await admin.auth.admin.getUserById(a.user_id);
    const email = u?.user?.email;
    if (!email) continue;
    const name = prof.name && prof.name !== "未設定" ? `${prof.name}さん` : "受検者の方へ";
    const minutes = co.questionnaire === "80" ? "約15分" : "約10分";
    await sendMails(
      [email],
      "【ストレスチェックWeb】ストレスチェックの回答がまだ完了していません",
      [
        name,
        "",
        `${fy}年度のストレスチェックの回答画面を開かれましたが、まだ回答の送信が完了していません。`,
        `途中までの回答は保存されないため、お手数ですが、下のリンクからもう一度回答してください(${minutes})。`,
        "",
        `${origin}/login?next=/exam`,
        ...(plan?.exam_end ? ["", `受検期間: ${formatJpDate(plan.exam_end)}まで`] : []),
        "",
        "このお知らせは1回だけお送りしています。すでに回答を終えている場合は、このメールは破棄してください。",
        "※ストレスチェックの回答内容は、本人の同意なく会社に伝わることはありません。",
      ].join("\n")
    );
    sent++;
  }
  return sent;
}
