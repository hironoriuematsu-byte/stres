import { NextResponse } from "next/server";
import { accessCodeHash, newToken } from "@/lib/contract-crypto";
import { parseAccessCode, SIGN_LINK_DAYS } from "@/lib/contract";
import { addEvent, clientIp, fail, loadContract, logOffice, mailSignRequest, officeContext, signUrl, siteOrigin } from "@/lib/contract-server";

export const runtime = "nodejs";

// 署名待ちの契約書のリンクを新しくして送り直す(実施者のみ)。期限切れ・メールの紛失・アクセスコードの回数超過のとき。
// 文面は変わらない(変える場合は取り消して新しく作る)。アクセスコードを新しく設定することもできる
export async function POST(req: Request) {
  const ctx = await officeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, email, name } = ctx;

  let body: { id?: unknown; accessCode?: unknown; clearAccessCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const c = await loadContract(admin, body.id);
  if (!c) return fail(404, "契約が見つかりません");
  if (c.status !== "sent") return fail(409, "再送できるのは署名待ちの契約書だけです");
  const code = parseAccessCode(body.accessCode);
  if (!code.ok) return fail(400, code.error);

  const { token, hash: tHash } = newToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SIGN_LINK_DAYS * 24 * 3600 * 1000).toISOString();
  const codeUpdate = body.clearAccessCode === true ? { access_code_hash: null } : code.value ? { access_code_hash: accessCodeHash(c.id, code.value) } : {};
  const { data: updated, error } = await admin
    .from("contracts")
    .update({ token_hash: tHash, token_expires_at: expires, code_attempts: 0, updated_at: now.toISOString(), ...codeUpdate })
    .eq("id", c.id)
    .eq("status", "sent")
    .select("*");
  if (error) return fail(500, `再送できませんでした: ${error.message}`);
  if (!updated || updated.length === 0) return fail(409, "契約の状態が変わりました。画面を更新してください");

  await addEvent(admin, c.id, {
    event: "resent",
    actor: "office",
    actor_name: name,
    actor_email: email,
    ip: clientIp(req.headers),
    detail: { expires_at: expires, access_code_changed: body.clearAccessCode === true || !!code.value },
  });
  await mailSignRequest({ ...c, ...updated[0] }, signUrl(siteOrigin(req), token), true);
  await logOffice(admin, userId, "contract_resent", c.contract_no, c.company_id);
  return NextResponse.json({ ok: true });
}
