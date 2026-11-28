import { NextResponse } from "next/server";
import { addEvent, clientIp, fail, loadContract, logOffice, mailCancelled, officeContext } from "@/lib/contract-server";

export const runtime = "nodejs";

// 下書きの削除、または署名待ちの契約書の取消(実施者のみ)。
// 下書きは記録ごと削除する。送信済みは「取消」の状態にして記録を残し、署名者にリンクが無効になったことを知らせる
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

  if (c.status === "draft") {
    const { error } = await admin.from("contracts").delete().eq("id", c.id).eq("status", "draft");
    if (error) return fail(500, `削除できませんでした: ${error.message}`);
    await logOffice(admin, userId, "contract_draft_deleted", c.contract_no, c.company_id);
    return NextResponse.json({ ok: true, deleted: true });
  }
  if (c.status !== "sent") return fail(409, "締結済み・辞退・取消済みの契約書は取り消せません");

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("contracts")
    .update({ status: "cancelled", cancelled_at: now, token_hash: null, updated_at: now })
    .eq("id", c.id)
    .eq("status", "sent")
    .select("id");
  if (error) return fail(500, `取り消せませんでした: ${error.message}`);
  if (!updated || updated.length === 0) return fail(409, "契約の状態が変わりました(署名された可能性があります)。画面を更新してください");

  await addEvent(admin, c.id, { event: "cancelled", actor: "office", actor_name: name, actor_email: email, ip: clientIp(req.headers) });
  await mailCancelled(c);
  await logOffice(admin, userId, "contract_cancelled", c.contract_no, c.company_id);
  return NextResponse.json({ ok: true });
}
