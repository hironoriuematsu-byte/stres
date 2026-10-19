import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestUser } from "@/lib/supabase/server";
import { adminClient, officeEmails, sendMails } from "@/lib/plan-server";
import type { IntakeMessage, IntakeStatus, RiskLevel, ShareConsent } from "@/lib/intake";
import { higherRisk, RISK_LABEL } from "@/lib/intake";
import { intakeSummarize } from "@/lib/intake-server";

// 事前問診のAPIで共通の処理(ログイン確認・記録の読み込み・実施者へのお知らせ)

export type IntakeRow = {
  id: string;
  request_id: string;
  user_id: string;
  company_id: string;
  status: IntakeStatus;
  messages: IntakeMessage[];
  risk_level: RiskLevel;
  progress: number;
  share_consent: ShareConsent | null;
  urgent_notified_at: string | null;
  summary: unknown;
  reply_draft: string | null;
  reply: string | null;
};

export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function intakeContext(req: Request): Promise<
  | { ok: true; admin: SupabaseClient; userId: string; role: string | null }
  | { ok: false; res: NextResponse }
> {
  const user = await requestUser(req);
  if (!user) return { ok: false, res: fail(401, "ログインの有効期限が切れました。ページを再読み込みして、もう一度ログインしてください。") };
  const admin = adminClient();
  if (!admin) return { ok: false, res: fail(500, "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です") };
  const { data: prof } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  return { ok: true, admin, userId: user.id, role: (prof?.role as string | undefined) ?? null };
}

export async function loadIntake(admin: SupabaseClient, id: unknown): Promise<IntakeRow | null> {
  if (typeof id !== "string" || !id) return null;
  const { data } = await admin.from("interview_intakes").select("*").eq("id", id).maybeSingle();
  return (data as IntakeRow | null) ?? null;
}

// 医師向けの要約・本人への返信の下書き・会社への共有の下書きを作って保存する。
// partial: 本人が途中でやめた時点までの内容で作る(問診は終わらせず、本人は続きから再開できる)
export async function saveSummary(admin: SupabaseClient, intake: IntakeRow, share: ShareConsent | null, partial = false): Promise<string | null> {
  const { data: request } = await admin.from("interview_requests").select("result_id").eq("id", intake.request_id).maybeSingle();
  const { data: result } = request
    ? await admin.from("results").select("score_a, score_b, score_c, high_stress").eq("id", request.result_id).maybeSingle()
    : { data: null };
  try {
    const s = await intakeSummarize(
      intake.messages,
      result as { score_a: number; score_b: number; score_c: number; high_stress: boolean } | null,
      share,
      partial
    );
    await admin
      .from("interview_intakes")
      .update({
        summary: s.summary,
        reply_draft: s.reply_draft,
        company_share_draft: s.company_share_draft || null,
        risk_level: higherRisk(intake.risk_level ?? "none", s.summary.risk_level),
        summary_error: null,
      })
      .eq("id", intake.id);
    return null;
  } catch (e) {
    console.error("intake summarize failed", e);
    const msg = "要約を作れませんでした(会話の記録は保存されています)。";
    await admin.from("interview_intakes").update({ summary_error: msg }).eq("id", intake.id);
    return msg;
  }
}

async function companyName(admin: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await admin.from("companies").select("name").eq("id", companyId).maybeSingle();
  return (data?.name as string | undefined) ?? "(不明)";
}

// 緊急度が高いときの実施者へのお知らせ(1回だけ)。本文に個人名・会話の内容は書かない
export async function notifyUrgent(admin: SupabaseClient, intake: IntakeRow, origin: string): Promise<void> {
  if (intake.urgent_notified_at) return;
  const { data: claimed } = await admin
    .from("interview_intakes")
    .update({ urgent_notified_at: new Date().toISOString() })
    .eq("id", intake.id)
    .is("urgent_notified_at", null)
    .select("id");
  if (!claimed || claimed.length === 0) return;
  await sendMails(
    await officeEmails(admin),
    "【至急・ストレスチェックWeb】事前問診で緊急度の高いサインがありました",
    [
      "面接指導の事前問診(AI)で、緊急度の高いサイン(希死念慮など)が見られました。",
      "至急ログインして、面接指導申出の一覧から内容を確認してください。",
      "",
      `企業名: ${await companyName(admin, intake.company_id)}`,
      `ログイン: ${origin}/office`,
    ].join("\n")
  );
}

// 聞き取りが終わったときの実施者へのお知らせ
export async function notifyCompleted(admin: SupabaseClient, intake: IntakeRow, risk: RiskLevel, origin: string): Promise<void> {
  await sendMails(
    await officeEmails(admin),
    `【ストレスチェックWeb】面接指導の事前問診が完了しました(緊急度: ${RISK_LABEL[risk]})`,
    [
      "面接指導の申出者の事前問診(AI)が完了し、要約と本人への返信の下書きができました。",
      "ログインして、面接指導申出の一覧から確認・返信してください。",
      "",
      `企業名: ${await companyName(admin, intake.company_id)}`,
      `緊急度: ${RISK_LABEL[risk]}`,
      `ログイン: ${origin}/office`,
    ].join("\n")
  );
}

export const siteOrigin = (req: Request): string => process.env.NEXT_PUBLIC_SITE_URL || req.headers.get("origin") || new URL(req.url).origin;
