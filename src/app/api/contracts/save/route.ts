import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { accessCodeHash } from "@/lib/contract-crypto";
import { contractNo, parseAccessCode, parseContractFields } from "@/lib/contract";
import { addEvent, fail, loadContract, logOffice, officeContext } from "@/lib/contract-server";

export const runtime = "nodejs";

// 契約の下書きを作る・直す(実施者のみ)。送信前の下書きだけ直せる。
// アクセスコード: 入力があれば新しく設定、空なら今の設定を保つ、clearAccessCode=true なら外す
export async function POST(req: Request) {
  const ctx = await officeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, email, name } = ctx;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const parsed = parseContractFields((body.fields as Record<string, unknown>) ?? {});
  if (!parsed.ok) return fail(400, parsed.error);
  const f = parsed.value;
  const code = parseAccessCode(body.accessCode);
  if (!code.ok) return fail(400, code.error);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const companyId = typeof body.companyId === "string" && /^[0-9a-f-]{36}$/i.test(body.companyId) ? body.companyId : null;
  if (companyId) {
    const { data: co } = await admin.from("companies").select("id").eq("id", companyId).maybeSingle();
    if (!co) return fail(400, "選択した企業が見つかりません");
  }

  const now = new Date().toISOString();
  const common = {
    company_id: companyId,
    fields: f,
    party_name: f.partyOfficeName ? `${f.partyName} ${f.partyOfficeName}` : f.partyName,
    signer_name: f.signerName,
    signer_email: f.signerEmail,
    signer_title: f.signerTitle || null,
    monthly_fee: f.monthlyFee,
    start_date: f.startDate,
    note: note || null,
    updated_at: now,
  };

  if (typeof body.id === "string") {
    const cur = await loadContract(admin, body.id);
    if (!cur) return fail(404, "契約が見つかりません");
    if (cur.status !== "draft") return fail(409, "送信済みの契約書は直せません。取り消して(または辞退後に)新しく作ってください");
    const codeUpdate = body.clearAccessCode === true ? { access_code_hash: null } : code.value ? { access_code_hash: accessCodeHash(cur.id, code.value) } : {};
    const { error } = await admin.from("contracts").update({ ...common, ...codeUpdate }).eq("id", cur.id).eq("status", "draft");
    if (error) return fail(500, `保存できませんでした: ${error.message}`);
    await addEvent(admin, cur.id, { event: "updated", actor: "office", actor_name: name, actor_email: email });
    return NextResponse.json({ ok: true, id: cur.id });
  }

  const id = randomUUID();
  const { error } = await admin.from("contracts").insert({
    id,
    contract_no: contractNo(id, now),
    kind: "sanpoi",
    status: "draft",
    ...common,
    access_code_hash: code.value ? accessCodeHash(id, code.value) : null,
    created_by: userId,
    created_at: now,
  });
  if (error) return fail(500, `保存できませんでした: ${error.message}`);
  await addEvent(admin, id, { event: "created", actor: "office", actor_name: name, actor_email: email });
  await logOffice(admin, userId, "contract_created", contractNo(id, now), companyId);
  return NextResponse.json({ ok: true, id });
}
