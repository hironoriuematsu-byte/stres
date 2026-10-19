import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { SHARE_OPTIONS, type ShareConsent, type ShareKey } from "@/lib/intake";
import { fail, intakeContext, loadIntake, notifyCompleted, notifyUrgent, saveSummary, shareToCompany, siteOrigin, type IntakeRow } from "@/lib/intake-api";

export const runtime = "nodejs";
export const maxDuration = 180;

// 事前問診を終えて医師に送る(本人)。本人にはすぐに「送りました」を返し、要約は裏で作る。
// 本人が会社への共有に同意していれば、要約と一緒にできた共有の文章を会社の担当者にメールで送る。
// 実施者(医師)が要約を作り直すときにも呼ばれる(このときは出来上がるまで待つ)。
// 本人が回答の途中なら、途中までの内容で要約を作る(問診は終わらせない)
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, role } = ctx;

  let body: { intakeId?: unknown; share?: { keys?: unknown; note?: unknown } };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const intake = await loadIntake(admin, body.intakeId);
  const isOffice = role === "office";
  if (!intake || (intake.user_id !== userId && !isOffice)) return fail(404, "事前問診が見つかりません");
  const userTurns = (intake.messages ?? []).filter((m) => m.role === "user").length;
  const origin = siteOrigin(req);

  // 実施者が作り直す
  if (isOffice && intake.user_id !== userId) {
    if (userTurns === 0) return fail(400, "会話の記録がありません");
    const err = await saveSummary(admin, intake, intake.share_consent, intake.status === "in_progress");
    if (err) return fail(502, err);
    return NextResponse.json({ ok: true });
  }

  if (intake.status !== "in_progress") return NextResponse.json({ ok: true });
  if (userTurns === 0) return fail(400, "まだ回答がありません");

  // 本人が選んだ「会社の担当者に伝えてよい範囲」
  const valid = new Set<string>(SHARE_OPTIONS.map((o) => o.key));
  const keys = Array.isArray(body.share?.keys) ? (body.share!.keys as unknown[]).filter((k): k is ShareKey => typeof k === "string" && valid.has(k)) : [];
  const note = typeof body.share?.note === "string" ? body.share.note.trim().slice(0, 500) : "";
  const share: ShareConsent = { keys, note, at: new Date().toISOString() };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("interview_intakes")
    .update({ status: "completed", completed_at: now, progress: 100, share_consent: share, updated_at: now })
    .eq("id", intake.id)
    .eq("status", "in_progress");
  if (error) return fail(500, `保存できませんでした: ${error.message}`);

  // 要約づくり(数十秒かかる)は、本人を待たせずに裏で行う
  waitUntil(
    (async () => {
      await saveSummary(admin, { ...intake, share_consent: share }, share);
      const { data: latest } = await admin
        .from("interview_intakes")
        .select("risk_level, company_share_draft")
        .eq("id", intake.id)
        .maybeSingle();
      // 本人が同意した範囲を、医師の確認を待たずに会社の担当者へ送る
      const draft = ((latest?.company_share_draft as string | null) ?? "").trim();
      if (share.keys.length > 0 && draft) await shareToCompany(admin, intake, draft, null, origin);
      const risk = (latest?.risk_level as IntakeRow["risk_level"] | undefined) ?? intake.risk_level ?? "none";
      if (risk === "high") await notifyUrgent(admin, intake, origin);
      await notifyCompleted(admin, intake, risk, origin);
    })()
  );
  return NextResponse.json({ ok: true });
}
