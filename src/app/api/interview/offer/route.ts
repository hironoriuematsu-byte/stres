import { NextResponse } from "next/server";
import { fail, intakeContext, siteOrigin } from "@/lib/intake-api";
import { excludeBooked, expandSlots, jstToday, MAX_SLOTS, validateRanges, type TimeRange } from "@/lib/interview-schedule";
import {
  bookedInterviews,
  companyInfo,
  loadRequest,
  mailScheduleCancelled,
  mailSlotsOffered,
  mailVisitScheduled,
  withdrawOpenSlots,
} from "@/lib/interview-schedule-server";

export const runtime = "nodejs";

// 実施者(医師)が面接指導の日程を決める
//   mode=online: 空いている時間帯から候補日時を作り、本人に選んでもらう
//   mode=visit:  次回の訪問日に対面で行うことにし、本人と会社の担当者に案内する
//   action=reset: 候補・確定した日程を取り消して、申出受付の状態に戻す
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

  if (body.action === "reset") {
    const hadOnlineDate = request.status === "scheduled" && request.schedule_mode === "online" && Boolean(request.scheduled_at);
    await withdrawOpenSlots(admin, request.id);
    await admin.from("interview_slots").update({ status: "withdrawn" }).eq("request_id", request.id).eq("status", "chosen");
    const { error } = await admin
      .from("interview_requests")
      .update({ status: "pending", schedule_mode: null, slots_offered_at: null, scheduled_at: null, duration_min: null, meet_url: null, visit_note: null, scheduled_by: null })
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
      .update({ status: "scheduled", schedule_mode: "visit", scheduled_at: scheduledAt, duration_min: null, meet_url: null, visit_note: note || null, scheduled_by: userId, slots_offered_at: null })
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
    .update({ schedule_mode: "online", slots_offered_at: now, duration_min: durationMin, scheduled_at: null, meet_url: null, visit_note: null, status: "pending" })
    .eq("id", request.id);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);

  const dates = [...new Set(ranges.map((r) => r.date))].sort();
  await mailSlotsOffered(admin, request, dates, origin);
  return NextResponse.json({ ok: true, count: starts.length });
}
