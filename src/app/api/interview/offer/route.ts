import { NextResponse } from "next/server";
import { fail, intakeContext, siteOrigin } from "@/lib/intake-api";
import { excludeBooked, expandSlots, jstToday, MAX_SLOTS, overlaps, validateRanges, type TimeRange } from "@/lib/interview-schedule";
import {
  bookedInterviews,
  companyInfo,
  declineProposals,
  loadRequest,
  mailScheduleCancelled,
  mailScheduledOnline,
  mailSlotsOffered,
  mailVisitScheduled,
  withdrawOpenSlots,
} from "@/lib/interview-schedule-server";

export const runtime = "nodejs";

// 実施者(医師)が面接指導の日程を決める
//   mode=online: 空いている時間帯から候補日時を作り、本人に選んでもらう
//   mode=visit:  次回の訪問日に対面で行うことにし、本人と会社の担当者に案内する
//   action=reset: 候補・確定した日程を取り消して、申出受付の状態に戻す
//   action=approve: 本人の希望日時から1つを承認して確定する
// 候補を出し直す・訪問にする・取り消すと、本人の希望日時(承認待ち)は見送りになる
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, role } = ctx;
  if (role !== "office") return fail(403, "日程を決められるのは実施者(医師)だけです");

  let body: {
    requestId?: unknown;
    action?: unknown;
    mode?: unknown;
    durationMin?: unknown;
    slotId?: unknown;
    ranges?: unknown;
    visitDate?: unknown;
    visitNote?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const request = await loadRequest(admin, body.requestId);
  if (!request) return fail(404, "申出が見つかりません");
  if (request.status === "done" || request.status === "cancelled") return fail(400, "この申出の面接指導は終了しています");
  const origin = siteOrigin(req);
  const now = new Date().toISOString();

  if (body.action === "approve") {
    if (request.status !== "pending" || !request.proposed_at) return fail(400, "承認できる希望の日時がありません");
    if (typeof body.slotId !== "string") return fail(400, "承認する日時を選んでください");
    const { data: slot } = await admin.from("interview_slots").select("*").eq("id", body.slotId).eq("request_id", request.id).maybeSingle();
    if (!slot || slot.status !== "proposed") return fail(409, "その希望の日時は承認できなくなりました");
    const startsAt = slot.starts_at as string;
    const durationMin = slot.duration_min as number;
    if (new Date(startsAt).getTime() < Date.now()) return fail(409, "その日時は過ぎています。別の希望を選ぶか、候補を出し直してください");
    const booked = await bookedInterviews(admin, request.id);
    if (booked.some((b) => overlaps(startsAt, durationMin, b.starts_at, b.duration_min))) {
      return fail(409, "その日時はほかの面談と重なっています。別の希望を選ぶか、候補を出し直してください");
    }
    const co = await companyInfo(admin, request.company_id);
    if (!co.meet_room_url) return fail(400, "先に、この企業の産業医面談ルーム(Google Meet)のURLを登録してください");
    const { data: claimed } = await admin
      .from("interview_slots")
      .update({ status: "chosen", chosen_at: now })
      .eq("id", slot.id)
      .eq("status", "proposed")
      .select("id");
    if (!claimed || claimed.length === 0) return fail(409, "その希望の日時は承認できなくなりました");
    const { error } = await admin
      .from("interview_requests")
      .update({ status: "scheduled", scheduled_at: startsAt, duration_min: durationMin, meet_url: co.meet_room_url, scheduled_by: userId })
      .eq("id", request.id);
    if (error) return fail(500, `保存できませんでした: ${error.message}`);
    // 残りの希望は見送り。ほかの申出の候補のうち、この面談と重なるものは閉じる
    await declineProposals(admin, request.id);
    const { data: others } = await admin.from("interview_slots").select("id, starts_at, duration_min").eq("status", "open").neq("request_id", request.id);
    const clash = (others ?? []).filter((o) => overlaps(startsAt, durationMin, o.starts_at as string, o.duration_min as number)).map((o) => o.id as string);
    if (clash.length > 0) await admin.from("interview_slots").update({ status: "withdrawn" }).in("id", clash);
    await mailScheduledOnline(
      admin,
      { ...request, status: "scheduled", scheduled_at: startsAt, duration_min: durationMin, meet_url: co.meet_room_url },
      co.name,
      origin,
      false
    );
    return NextResponse.json({ ok: true });
  }

  // ここから先(取り消し・訪問・候補の出し直し)では、本人の希望日時は見送りにする
  if (request.proposed_at) await declineProposals(admin, request.id);
  // SQL 0033 の実行前は列がないので触らない(select("*") で列があるかがわかる)
  const clearProposal = "proposed_at" in request ? { proposed_at: null, proposal_note: null } : {};

  if (body.action === "reset") {
    const hadOnlineDate = request.status === "scheduled" && request.schedule_mode === "online" && Boolean(request.scheduled_at);
    await withdrawOpenSlots(admin, request.id);
    await admin.from("interview_slots").update({ status: "withdrawn" }).eq("request_id", request.id).eq("status", "chosen");
    const { error } = await admin
      .from("interview_requests")
      .update({ status: "pending", schedule_mode: null, slots_offered_at: null, scheduled_at: null, duration_min: null, meet_url: null, visit_note: null, scheduled_by: null, ...clearProposal })
      .eq("id", request.id);
    if (error) return fail(500, `保存できませんでした: ${error.message}`);
    if (hadOnlineDate) await mailScheduleCancelled(admin, request, origin, "doctor");
    return NextResponse.json({ ok: true });
  }

  if (body.mode === "visit") {
    const date = typeof body.visitDate === "string" ? body.visitDate : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) return fail(400, "訪問日を入れてください");
    if (date < jstToday()) return fail(400, "訪問日は今日以降の日付にしてください");
    const note = typeof body.visitNote === "string" ? body.visitNote.trim().slice(0, 200) : "";
    await withdrawOpenSlots(admin, request.id);
    const scheduledAt = new Date(`${date}T00:00:00+09:00`).toISOString();
    const { error } = await admin
      .from("interview_requests")
      .update({ status: "scheduled", schedule_mode: "visit", scheduled_at: scheduledAt, duration_min: null, meet_url: null, visit_note: note || null, scheduled_by: userId, slots_offered_at: null, ...clearProposal })
      .eq("id", request.id);
    if (error) return fail(500, `保存できませんでした: ${error.message}`);
    const co = await companyInfo(admin, request.company_id);
    await mailVisitScheduled(admin, { ...request, status: "scheduled", schedule_mode: "visit", scheduled_at: scheduledAt, visit_note: note || null }, co.name, origin);
    return NextResponse.json({ ok: true });
  }

  if (body.mode !== "online") return fail(400, "日程の決め方を選んでください");
  const durationMin = Number(body.durationMin);
  const ranges = Array.isArray(body.ranges)
    ? (body.ranges as unknown[]).map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        return { date: String(o.date ?? ""), start: String(o.start ?? ""), end: String(o.end ?? "") } as TimeRange;
      })
    : [];
  const bad = validateRanges(ranges, durationMin);
  if (bad) return fail(400, bad);
  const co = await companyInfo(admin, request.company_id);
  if (!co.meet_room_url) return fail(400, "先に、この企業の産業医面談ルーム(Google Meet)のURLを登録してください");

  const starts = excludeBooked(expandSlots(ranges, durationMin), durationMin, await bookedInterviews(admin, request.id));
  if (starts.length === 0) return fail(400, "入れた時間帯は、すでに確定している面談と重なっています");
  if (starts.length > MAX_SLOTS) return fail(400, `候補が多すぎます(${starts.length}件)。時間帯を絞ってください(上限${MAX_SLOTS}件)`);

  // 以前の候補を取り下げ、新しい候補を登録する
  await withdrawOpenSlots(admin, request.id);
  const { error: insErr } = await admin.from("interview_slots").upsert(
    starts.map((s) => ({ request_id: request.id, user_id: request.user_id, company_id: request.company_id, starts_at: s, duration_min: durationMin, status: "open", chosen_at: null })),
    { onConflict: "request_id,starts_at" }
  );
  if (insErr) return fail(500, `候補を保存できませんでした: ${insErr.message}`);
  const { error } = await admin
    .from("interview_requests")
    .update({ schedule_mode: "online", slots_offered_at: now, duration_min: durationMin, scheduled_at: null, meet_url: null, visit_note: null, status: "pending", ...clearProposal })
    .eq("id", request.id);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);

  const dates = [...new Set(ranges.map((r) => r.date))].sort();
  // 希望を見送って出し直したときは、メールにその旨を添える(request.proposed_at は更新前の値)
  await mailSlotsOffered(admin, request, dates, origin);
  return NextResponse.json({ ok: true, count: starts.length });
}
