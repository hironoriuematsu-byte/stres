import { NextResponse } from "next/server";
import { accessCodeHash, safeEqualHex } from "@/lib/contract-crypto";
import { CODE_MAX_ATTEMPTS, isExpired } from "@/lib/contract";
import { addEvent, clientIp, completeContract, fail, loadContractByToken, mailCompleted, publicContext, signUrl, siteOrigin, userAgent } from "@/lib/contract-server";

export const runtime = "nodejs";

// 契約先(甲)の電子署名。メールで送った署名用リンクのトークンで本人を確認し、
// (設定があれば)アクセスコードを確認したうえで、合意の記録を残して締結を完了する
export async function POST(req: Request) {
  const ctx = publicContext();
  if (!ctx.ok) return ctx.res;
  const { admin } = ctx;

  let body: { token?: unknown; name?: unknown; title?: unknown; agree?: unknown; accessCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const c = await loadContractByToken(admin, body.token);
  if (!c) return fail(404, "このリンクは無効です。送信者にご確認ください");
  if (c.status === "signed") return fail(409, "この契約書はすでに締結されています");
  if (c.status !== "sent") return fail(409, "この契約書は送信者により取り消されたか、辞退されています");
  if (isExpired(c.status, c.token_expires_at)) return fail(410, "署名の期限が切れています。送信者にリンクの再送を依頼してください");

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 60) : "";
  if (!name) return fail(400, "署名者の氏名を入力してください");
  if (body.agree !== true) return fail(400, "契約内容への同意のチェックが必要です");

  if (c.access_code_hash) {
    if (c.code_attempts >= CODE_MAX_ATTEMPTS) return fail(423, "アクセスコードの入力回数の上限に達しました。送信者にリンクの再送を依頼してください");
    const code = typeof body.accessCode === "string" ? body.accessCode.trim() : "";
    if (!code || !safeEqualHex(accessCodeHash(c.id, code), c.access_code_hash)) {
      const attempts = c.code_attempts + 1;
      await admin.from("contracts").update({ code_attempts: attempts }).eq("id", c.id);
      const left = CODE_MAX_ATTEMPTS - attempts;
      return fail(400, left > 0 ? `アクセスコードが違います(あと${left}回入力できます)` : "アクセスコードの入力回数の上限に達しました。送信者にリンクの再送を依頼してください");
    }
  }

  const now = new Date().toISOString();
  const ip = clientIp(req.headers);
  // 同時に2回押されても1回しか署名にならないよう、状態が「署名待ち」のときだけ更新する
  const { data: updated, error } = await admin
    .from("contracts")
    .update({ status: "signed", signed_at: now, signed_name: name, signed_title: title || null, signed_ip: ip, updated_at: now })
    .eq("id", c.id)
    .eq("status", "sent")
    .select("*");
  if (error) return fail(500, `署名を保存できませんでした: ${error.message}`);
  if (!updated || updated.length === 0) return fail(409, "この契約書はすでに処理されています。画面を更新してください");
  const row = { ...c, ...updated[0] };

  try {
    const signed = await addEvent(admin, c.id, {
      event: "signed",
      actor: "party",
      actor_name: title ? `${name}(${title})` : name,
      actor_email: c.signer_email,
      ip,
      user_agent: userAgent(req.headers),
      detail: { agreed: true, document_hash: c.document_hash, access_code_used: !!c.access_code_hash },
    });
    const done = await completeContract(admin, row, signed);
    const origin = siteOrigin(req);
    await mailCompleted(admin, { ...row, completion_hash: done.completionHash, service_signature: done.signature }, signUrl(origin, body.token as string), origin);
  } catch (e) {
    console.error("contract sign post-processing failed", e);
    return fail(500, "署名は記録されましたが、締結の処理の一部に失敗しました。送信者(うえまつ産業医事務所)にご連絡ください");
  }
  return NextResponse.json({ ok: true });
}
