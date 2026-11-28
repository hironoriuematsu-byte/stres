import { NextResponse } from "next/server";
import { newToken, sha256 } from "@/lib/contract-crypto";
import { CONTRACT_TEMPLATE_VERSION, contractText, parseContractFields, renderContract, SIGN_LINK_DAYS } from "@/lib/contract";
import { addEvent, clientIp, fail, loadContract, logOffice, mailSentNotice, mailSignRequest, officeContext, OFFICE_SIGN_NAME, signUrl, siteOrigin, userAgent } from "@/lib/contract-server";

export const runtime = "nodejs";

// 下書きの契約書を契約先の署名者に送る(実施者のみ)。
// この時点で文面を確定してハッシュを保存し、乙(事務所)の合意の記録を残す。署名用リンクはメールで送る
export async function POST(req: Request) {
  const ctx = await officeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, email, name } = ctx;

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const c = await loadContract(admin, body.id);
  if (!c) return fail(404, "契約が見つかりません");
  if (c.status !== "draft") return fail(409, "この契約書はすでに送信済みです");
  const parsed = parseContractFields(c.fields as unknown as Record<string, unknown>);
  if (!parsed.ok) return fail(400, `契約の内容に不足があります: ${parsed.error}`);

  const doc = renderContract(parsed.value, { contractNo: c.contract_no, templateVersion: CONTRACT_TEMPLATE_VERSION });
  const text = contractText(doc);
  const hash = sha256(text);
  const { token, hash: tHash } = newToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SIGN_LINK_DAYS * 24 * 3600 * 1000).toISOString();

  const { data: updated, error } = await admin
    .from("contracts")
    .update({
      status: "sent",
      template_version: CONTRACT_TEMPLATE_VERSION,
      document: doc,
      document_text: text,
      document_hash: hash,
      token_hash: tHash,
      token_expires_at: expires,
      code_attempts: 0,
      sent_at: now.toISOString(),
      sent_by: userId,
      updated_at: now.toISOString(),
    })
    .eq("id", c.id)
    .eq("status", "draft")
    .select("*");
  if (error) return fail(500, `送信できませんでした: ${error.message}`);
  if (!updated || updated.length === 0) return fail(409, "この契約書はすでに送信済みです");
  const row = { ...c, ...updated[0] };

  await addEvent(admin, c.id, {
    event: "sent",
    actor: "office",
    actor_name: `${OFFICE_SIGN_NAME}(操作: ${name ?? email ?? ""})`,
    actor_email: email,
    ip: clientIp(req.headers),
    user_agent: userAgent(req.headers),
    detail: { document_hash: hash, template_version: CONTRACT_TEMPLATE_VERSION, signer_email: c.signer_email, expires_at: expires, agreed: true },
  });

  const origin = siteOrigin(req);
  await mailSignRequest(row, signUrl(origin, token), false);
  await mailSentNotice(admin, row, origin, name);
  await logOffice(admin, userId, "contract_sent", c.contract_no, c.company_id);
  return NextResponse.json({ ok: true });
}
