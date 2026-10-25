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

// ============================================================
// 未受検者へのリマインド(実施者・実施事務従事者が画面から送る)
//   対象: その企業でアカウントを登録済みの従業員のうち、当年度の結果がない人(QRコードから登録していない人には届かない)
//   同じ企業へは24時間に1回まで(送った記録は access_logs に残す)
// ============================================================

export const MANUAL_REMIND_INTERVAL_HOURS = 24;
export const MANUAL_REMIND_ACTION = "exam_remind_unexamined";

export type Unexamined = { user_id: string; name: string; dept: string | null };

// 前回の送信から十分に時間がたっているか
export function canSendAgain(lastSentAt: string | null, now: Date = new Date()): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - new Date(lastSentAt).getTime() >= MANUAL_REMIND_INTERVAL_HOURS * 3600_000;
}

// 登録済みの従業員と、そのうち当年度の結果がない人
export async function unexaminedMembers(
  admin: SupabaseClient,
  companyId: string,
  fiscalYear: number
): Promise<{ registered: number; members: Unexamined[] }> {
  const [{ data: profs }, { data: results }] = await Promise.all([
    admin.from("profiles").select("user_id, name, dept").eq("company_id", companyId).eq("role", "employee"),
    admin.from("results").select("user_id").eq("company_id", companyId).eq("fiscal_year", fiscalYear),
  ]);
  const done = new Set((results ?? []).map((r) => r.user_id as string));
  const all = (profs ?? []) as { user_id: string; name: string | null; dept: string | null }[];
  const members = all
    .filter((p) => !done.has(p.user_id))
    .map((p) => ({ user_id: p.user_id, name: p.name && p.name !== "未設定" ? p.name : "(氏名未登録)", dept: p.dept }))
    .sort((a, b) => (a.dept ?? "").localeCompare(b.dept ?? "", "ja") || a.name.localeCompare(b.name, "ja"));
  return { registered: all.length, members };
}

// Web申込の企業で、いまは受検できない理由(受検期間外・人数枠がいっぱい)。受検できるなら null
export async function examBlockReason(admin: SupabaseClient, companyId: string, fiscalYear: number, now: Date = new Date()): Promise<string | null> {
  const { data: co } = await admin.from("companies").select("web_signup").eq("id", companyId).maybeSingle();
  if (!co?.web_signup) return null;
  const { data: plan } = await admin.from("exam_plans").select("exam_start, exam_end, seats").eq("company_id", companyId).eq("fiscal_year", fiscalYear).maybeSingle();
  if (!plan) return "今年度のお申込みがないため、受検できません";
  const today = jstToday(now);
  if (today < (plan.exam_start as string)) return `受検期間(${formatJpDate(plan.exam_start as string)}から)の前です`;
  if (today > (plan.exam_end as string)) return "受検期間が終わっています";
  const { count } = await admin.from("results").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("fiscal_year", fiscalYear);
  if ((count ?? 0) >= (plan.seats as number)) return "受検者数が申込人数に達しているため、これ以上受検できません";
  return null;
}

// 前回の送信(この企業・この年度)
export async function lastManualRemind(admin: SupabaseClient, companyId: string, fiscalYear: number): Promise<{ at: string; role: string | null; target: string | null } | null> {
  const { data } = await admin
    .from("access_logs")
    .select("created_at, role, target")
    .eq("action", MANUAL_REMIND_ACTION)
    .eq("company_id", companyId)
    .like("target", `fy=${fiscalYear}%`)
    .order("created_at", { ascending: false })
    .limit(1);
  const r = data?.[0];
  return r ? { at: r.created_at as string, role: (r.role as string | null) ?? null, target: (r.target as string | null) ?? null } : null;
}

// 未受検者にメールを送る(1人ずつ)。送った人数を返す
export async function sendUnexaminedReminders(
  admin: SupabaseClient,
  companyId: string,
  fiscalYear: number,
  members: Unexamined[],
  origin: string
): Promise<number> {
  const [{ data: co }, { data: plan }] = await Promise.all([
    admin.from("companies").select("name, questionnaire, web_signup").eq("id", companyId).maybeSingle(),
    admin.from("exam_plans").select("exam_end").eq("company_id", companyId).eq("fiscal_year", fiscalYear).maybeSingle(),
  ]);
  const minutes = co?.questionnaire === "80" ? "約15分" : "約10分";
  const examEnd = co?.web_signup ? ((plan?.exam_end as string | undefined) ?? null) : null;
  let sent = 0;
  for (const m of members) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id);
    const email = u?.user?.email;
    if (!email) continue;
    await sendMails(
      [email],
      "【ストレスチェックWeb】ストレスチェックの受検のお願い",
      [
        m.name !== "(氏名未登録)" ? `${m.name}さん` : "受検者の方へ",
        "",
        `${co?.name ?? ""}の${fiscalYear}年度のストレスチェックを実施しています。まだ受検がお済みでない方にお送りしています。`,
        `下のリンクからログインして、回答してください(${minutes})。スマートフォンからも回答できます。`,
        "",
        `${origin}/login?next=/exam`,
        ...(examEnd ? ["", `受検期間: ${formatJpDate(examEnd)}まで`] : []),
        "",
        "すでに受検を終えている場合は、このメールは破棄してください。",
        "※ストレスチェックの結果は、本人の同意なく会社に伝わることはありません。",
      ].join("\n")
    );
    sent++;
  }
  return sent;
}
