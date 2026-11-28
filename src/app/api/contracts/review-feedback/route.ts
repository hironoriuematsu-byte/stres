import { NextResponse } from "next/server";
import { addEvent, clientIp, fail, loadContractByReviewToken, mailReviewFeedback, publicContext, siteOrigin, userAgent } from "@/lib/contract-server";

export const runtime = "nodejs";

// 確認用リンクからの返答(問題なし / 修正希望)。ログイン不要。署名ではなく、契約は成立しない
export async function POST(req: Request) {
  const ctx = publicContext();
  if (!ctx.ok) return ctx.res;
  const { admin } = ctx;

  let body: { token?: unknown; kind?: unknown; comment?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const c = await loadContractByReviewToken(admin, body.token);
  if (!c || c.status !== "draft") return fail(404, "このリンクは無効です(案文が署名用リンクに進んだか、取り下げられました)");
  const kind = body.kind === "ok" ? "ok" : body.kind === "revise" ? "revise" : null;
  if (!kind) return fail(400, "回答の種類が不正です");
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : "";
  if (kind === "revise" && !comment) return fail(400, "修正してほしい点を入力してください");

  const now = new Date().toISOString();
  const { error } = await admin
    .from("contracts")
    .update({ review_feedback_at: now, review_feedback_kind: kind, review_feedback: comment || null, updated_at: now })
    .eq("id", c.id)
    .eq("status", "draft");
  if (error) return fail(500, `送れませんでした: ${error.message}`);

  await addEvent(admin, c.id, {
    event: kind === "ok" ? "review_ok" : "review_revise",
    actor: "party",
    actor_name: c.signer_name,
    actor_email: c.signer_email,
    ip: clientIp(req.headers),
    user_agent: userAgent(req.headers),
    detail: { comment: comment || null },
  });
  await mailReviewFeedback(admin, c, kind, comment, siteOrigin(req));
  return NextResponse.json({ ok: true });
}
