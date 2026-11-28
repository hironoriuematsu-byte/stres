import { NextResponse } from "next/server";
import { newToken } from "@/lib/contract-crypto";
import { parseContractFields } from "@/lib/contract";
import { addEvent, clientIp, fail, loadContract, logOffice, mailReviewRequest, officeContext, reviewUrl, siteOrigin } from "@/lib/contract-server";

export const runtime = "nodejs";

// 確認用リンク(署名なし)を相手に送る(実施者のみ・下書きのみ)。
// すでにリンクがあれば同じリンクで送り直す(下書きを直したことの連絡に使える)。新しいリンクにするときは renew=true
export async function POST(req: Request) {
  const ctx = await officeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, email, name } = ctx;

  let body: { id?: unknown; message?: unknown; renew?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const c = await loadContract(admin, body.id);
  if (!c) return fail(404, "契約が見つかりません");
  if (c.status !== "draft") return fail(409, "確認用リンクを送れるのは下書きの間だけです(送信後は署名用リンクで確認できます)");
  const parsed = parseContractFields(c.fields as unknown as Record<string, unknown>);
  if (!parsed.ok) return fail(400, `契約の内容に不足があります: ${parsed.error}`);
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";

  const token = c.review_token && body.renew !== true ? c.review_token : newToken().token;
  const now = new Date().toISOString();
  const { error } = await admin.from("contracts").update({ review_token: token, review_sent_at: now, updated_at: now }).eq("id", c.id).eq("status", "draft");
  if (error) return fail(500, `送れませんでした: ${error.message}`);

  await addEvent(admin, c.id, {
    event: "review_sent",
    actor: "office",
    actor_name: name,
    actor_email: email,
    ip: clientIp(req.headers),
    detail: { signer_email: c.signer_email, same_link: token === c.review_token },
  });
  await mailReviewRequest({ ...c, review_token: token, review_sent_at: now }, reviewUrl(siteOrigin(req), token), message);
  await logOffice(admin, userId, "contract_review_sent", c.contract_no, c.company_id);
  return NextResponse.json({ ok: true });
}
