import { NextResponse } from "next/server";
import { higherRisk } from "@/lib/intake";
import { intakeSummarize } from "@/lib/intake-server";
import { fail, intakeContext, loadIntake, notifyCompleted, notifyUrgent, siteOrigin } from "@/lib/intake-api";

export const runtime = "nodejs";
export const maxDuration = 120;

// 事前ヒアリングを終えて、医師向けの要約と本人への返信の下書きを作る。
// 本人が終えるとき、または実施者が要約を作り直すときに呼ばれる
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, role } = ctx;

  let body: { intakeId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const intake = await loadIntake(admin, body.intakeId);
  const isOffice = role === "office";
  if (!intake || (intake.user_id !== userId && !isOffice)) return fail(404, "事前ヒアリングが見つかりません");
  const userTurns = (intake.messages ?? []).filter((m) => m.role === "user").length;
  const firstTime = intake.status === "in_progress";

  const { data: request } = await admin.from("interview_requests").select("result_id").eq("id", intake.request_id).maybeSingle();
  const { data: result } = request
    ? await admin.from("results").select("score_a, score_b, score_c, high_stress").eq("id", request.result_id).maybeSingle()
    : { data: null };

  let summary: unknown = intake.summary;
  let replyDraft = intake.reply_draft;
  let risk = intake.risk_level ?? "none";
  let summaryError: string | null = null;
  if (userTurns > 0) {
    try {
      const s = await intakeSummarize(intake.messages, result as { score_a: number; score_b: number; score_c: number; high_stress: boolean } | null);
      summary = s.summary;
      replyDraft = s.reply_draft;
      risk = higherRisk(risk, s.summary.risk_level);
    } catch (e) {
      console.error("intake summarize failed", e);
      summaryError = "要約を作れませんでした(会話の記録は保存されています)。";
    }
  }

  const now = new Date().toISOString();
  const { error } = await admin
    .from("interview_intakes")
    .update({
      status: userTurns > 0 ? "completed" : "abandoned",
      summary,
      reply_draft: replyDraft,
      risk_level: risk,
      completed_at: intake.status === "in_progress" ? now : undefined,
      updated_at: now,
    })
    .eq("id", intake.id);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);

  const origin = siteOrigin(req);
  if (risk === "high") await notifyUrgent(admin, intake, origin);
  if (firstTime && userTurns > 0) await notifyCompleted(admin, intake, risk, origin);
  if (summaryError && isOffice) return fail(502, summaryError);
  return NextResponse.json({ ok: true, risk_level: risk });
}
