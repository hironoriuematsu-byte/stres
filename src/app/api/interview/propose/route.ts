import { NextResponse } from "next/server";
import { fail, intakeContext, siteOrigin } from "@/lib/intake-api";
import { jstIso, overlaps, PROPOSAL_NOTE_MAX, proposalFirstDate, validateProposals, type Proposal } from "@/lib/interview-schedule";
import {
  bookedInterviews,
  companyInfo,
  declineProposals,
  lastOfferedDate,
  loadRequest,
  mailProposalsReceived,
  withdrawOpenSlots,
} from "@/lib/interview-schedule-server";

export const runtime = "nodejs";

// 本人が希望の日時を送る(医師の候補に都合の合う日時がないとき)。
// 医師の候補の最終日より後の営業日から5つまで。送ると医師の候補は閉じ、医師が希望から1つを承認すると確定する。
// 送り直すと、前の希望は見送りにして入れ替える
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId } = ctx;

  let body: { requestId?: unknown; proposals?: unknown; note?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const request = await loadRequest(admin, body.requestId);
  if (!request || request.user_id !== userId) return fail(404, "申出が見つかりません");
  if (request.status !== "pending" || request.schedule_mode !== "online" || !request.slots_offered_at) {
    return fail(400, "いまは希望の日時を送れる状態ではありません");
  }

  const proposals: Proposal[] = Array.isArray(body.proposals)
    ? (body.proposals as unknown[]).map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return { date: String(o.date ?? ""), start: String(o.start ?? "") };
      })
    : [];
  const durationMin = request.duration_min ?? 30;
  const firstDate = proposalFirstDate(await lastOfferedDate(admin, request.id));
  const bad = validateProposals(proposals, durationMin, firstDate);
  if (bad) return fail(400, bad);
  const note = typeof body.note === "string" ? body.note.trim().slice(0, PROPOSAL_NOTE_MAX) : "";

  // すでに確定しているほかの面談と重なる日時は受け付けない(医師は1人)
  const starts = proposals.map((p) => jstIso(p.date, p.start)).sort();
  const booked = await bookedInterviews(admin, request.id);
  const clash = starts.filter((s) => booked.some((b) => overlaps(s, durationMin, b.starts_at, b.duration_min)));
  if (clash.length > 0) return fail(409, "選んだ日時のうち、すでにほかの予定が入っている時間があります。別の時間を選んでください");

  // 医師の候補を閉じ、前の希望は見送りにしてから、新しい希望を登録する
  await withdrawOpenSlots(admin, request.id);
  await declineProposals(admin, request.id);
  const { error: insErr } = await admin.from("interview_slots").upsert(
    starts.map((s) => ({
      request_id: request.id,
      user_id: request.user_id,
      company_id: request.company_id,
      starts_at: s,
      duration_min: durationMin,
      status: "proposed",
      proposed_by_user: true,
      chosen_at: null,
    })),
    { onConflict: "request_id,starts_at" }
  );
  if (insErr) return fail(500, `希望の日時を保存できませんでした: ${insErr.message}`);
  const { error } = await admin
    .from("interview_requests")
    .update({ proposed_at: new Date().toISOString(), proposal_note: note || null })
    .eq("id", request.id);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);

  const co = await companyInfo(admin, request.company_id);
  await mailProposalsReceived(admin, co.name, starts.length, siteOrigin(req));
  return NextResponse.json({ ok: true, count: starts.length });
}
