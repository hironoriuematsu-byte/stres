import { NextResponse } from "next/server";
import { addEvent, clientIp, fail, loadContractByToken, mailDeclined, publicContext, siteOrigin, userAgent } from "@/lib/contract-server";

export const runtime = "nodejs";

// 契約先(甲)が署名を辞退する(内容の修正の希望など)。理由は実施者に知らせる
export async function POST(req: Request) {
  const ctx = publicContext();
  if (!ctx.ok) return ctx.res;
  const { admin } = ctx;

  let body: { token?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const c = await loadContractByToken(admin, body.token);
  if (!c) return fail(404, "このリンクは無効です。送信者にご確認ください");
  if (c.status !== "sent") return fail(409, "この契約書はすでに処理されています");
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("contracts")
    .update({ status: "declined", declined_at: now, decline_reason: reason || null, updated_at: now })
    .eq("id", c.id)
    .eq("status", "sent")
    .select("id");
  if (error) return fail(500, `保存できませんでした: ${error.message}`);
  if (!updated || updated.length === 0) return fail(409, "この契約書はすでに処理されています");

  await addEvent(admin, c.id, {
    event: "declined",
    actor: "party",
    actor_name: c.signer_name,
    actor_email: c.signer_email,
    ip: clientIp(req.headers),
    user_agent: userAgent(req.headers),
    detail: { reason: reason || null },
  });
  await mailDeclined(admin, c, reason, siteOrigin(req));
  return NextResponse.json({ ok: true });
}
