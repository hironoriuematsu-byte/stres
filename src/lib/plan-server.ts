import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { sendViaResend, sleep } from "@/lib/mail";
import { SELLER } from "@/lib/org";
import { formatJpDate, interviewOptionLabel, taxIncluded } from "@/lib/plan";

// Web申込のサーバー処理で共通に使うもの(service_role のクライアント・メール)

export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// 領収書(Stripe の請求書PDF)の下部に載せる文言
export function invoiceFooter(total: number): string {
  const reg = process.env.INVOICE_REGISTRATION_NO?.trim();
  return [
    `${SELLER.name} ${SELLER.address}`,
    reg ? `登録番号: ${reg}` : null,
    `上記金額のうち消費税(10%対象) ${taxIncluded(total).toLocaleString()}円`,
  ]
    .filter(Boolean)
    .join(" / ");
}

export async function officeEmails(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from("profiles").select("user_id").eq("role", "office");
  const emails: string[] = [];
  for (const r of data ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(r.user_id);
    if (u?.user?.email) emails.push(u.user.email);
  }
  return emails;
}

// メールをまとめて送る(設定が無い・失敗しても処理は止めない)
export async function sendMails(to: string[], subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SENDER_EMAIL;
  if (!key || !from) {
    console.warn("plan mail skipped: RESEND_API_KEY / SENDER_EMAIL が未設定");
    return;
  }
  for (let i = 0; i < to.length; i++) {
    if (i > 0) await sleep(600);
    const r = await sendViaResend(key, { from, to: [to[i]], subject, text });
    if (!r.ok) console.error("plan mail failed", to[i], r.detail);
  }
}

export type OrderRow = {
  id: string;
  kind: "new" | "add_seats";
  status: string;
  company_id: string | null;
  fiscal_year: number;
  seats: number;
  amount: number;
  company_name: string;
  office_name: string | null;
  address: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  workers: number | null;
  questionnaire: string;
  exam_start: string | null;
  exam_end: string | null;
  interview_option: string | null;
  error: string | null;
};

export function orderSummary(o: OrderRow, seatsGranted: number): string {
  return [
    `会社名: ${o.company_name}${o.office_name ? ` ${o.office_name}` : ""}`,
    `ご担当者: ${o.contact_name} 様 (${o.contact_email}${o.contact_phone ? ` / ${o.contact_phone}` : ""})`,
    o.kind === "new"
      ? `受検期間: ${formatJpDate(o.exam_start)} 〜 ${formatJpDate(o.exam_end)}`
      : `追加人数: ${o.seats}名`,
    o.kind === "new" ? `受検人数: ${seatsGranted}名まで(お申込み ${o.seats}名)` : null,
    o.kind === "new" ? `調査票: ${o.questionnaire === "80" ? "80項目版" : "57項目版"}` : null,
    o.kind === "new" ? `産業医面接指導: ${interviewOptionLabel(o.interview_option)}` : null,
    `お支払い金額: ${o.amount.toLocaleString()}円(税込)`,
  ]
    .filter(Boolean)
    .join("\n");
}
