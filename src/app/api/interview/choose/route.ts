import { NextResponse } from "next/server";
import { fail, intakeContext, siteOrigin } from "@/lib/intake-api";
import { overlaps } from "@/lib/interview-schedule";
import { bookedInterviews, companyInfo, loadRequest, mailScheduleCancelled, mailScheduledOnline, withdrawOpenSlots } from "@/lib/interview-schedule-server";

export const runtime = "nodejs";

// 本人が候補日時を1つ選んで確定する(action=cancel: 確定した日程を本人が取り消す)
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId } = ctx;

  let body: { requestId?: unknown; slotId?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const request = await loadRequest(admin, body.requestId);
  if (!request || request.user_id !== userId) return fail(404, "申出が見つかりません");
  const origin = siteOrigin(req);

  if (body.action === "cancel") {
    if (request.status !== "scheduled" || request.schedule_mode !== "online") return fail(400, "取り消せる日程がありません");
    if (request.scheduled_at && new Date(request.scheduled_at).getTime() - Date.now() < 24 * 3600_000) {
      return fail(400, "面談の24時間前を過ぎているため、画面からは取り消せません。会社の担当者または当事務所にご連絡ください");
    }
    // 選んだ候補を開き直し、申出受付の状態に戻す(ほかの候補が残っていれば選び直せる)
    await admin.from("interview_slots").update({ status: "open", chosen_at: null }).eq("request_id", request.id).eq("status", "chosen");
    const { error } = await admin
      .from("interview_requests")
      .update({ status: "pending", scheduled_at: null, meet_url: null, scheduled_by: null })
      .eq("id", request.id)
      .eq("status", "scheduled");
    if (error) return fail(500, `保存できませんでした: ${error.message}`);
    await mailScheduleCancelled(admin, request, origin, "self");
    return NextResponse.json({ ok: true });
  }

  if (request.status !== "pending" || request.schedule_mode !== "online") return fail(400, "いまは候補日時を選べる状態ではありません");
  if (typeof body.slotId !== "string") return fail(400, "日時を選んでください");
  const { data: slot } = await admin.from("interview_slots").select("*").eq("id", body.slotId).eq("request_id", request.id).maybeSingle();
  if (!slot || slot.status !== "open") return fail(409, "その日時は選べなくなりました。別の日時を選んでください");
  const startsAt = slot.starts_at as string;
  const durationMin = slot.duration_min as number;
  if (new Date(startsAt).getTime() < Date.now()) return fail(409, "その日時は過ぎています。別の日時を選んでください");

  // ほかの方の面談と重なっていないか(医師は1人)
  const booked = await bookedInterviews(admin, request.id);
  if (booked.some((b) => overlaps(startsAt, durationMin, b.starts_at, b.duration_min))) {
    await admin.from("interview_slots").update({ status: "withdrawn" }).eq("id", slot.id);
    return fail(409, "その日時はほかの面談と重なったため選べません。別の日時を選んでください");
  }

  // 候補を確保する(同時に押されても1つしか通らない)
  const now = new Date().toISOString();
  const { data: claimed } = await admin
    .from("interview_slots")
    .update({ status: "chosen", chosen_at: now })
    .eq("id", slot.id)
    .eq("status", "open")
    .select("id");
  if (!claimed || claimed.length === 0) return fail(409, "その日時は選べなくなりました。別の日時を選んでください");

  const co = await companyInfo(admin, request.company_id);
  const { error } = await admin
    .from("interview_requests")
    .update({ status: "scheduled", scheduled_at: startsAt, duration_min: durationMin, meet_url: co.meet_room_url, scheduled_by: userId })
    .eq("id", request.id);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);

  // この申出の残りの候補は閉じる。ほかの申出の候補のうち、この面談と重なるものも閉じる
  await withdrawOpenSlots(admin, request.id);
  const { data: others } = await admin.from("interview_slots").select("id, starts_at, duration_min").eq("status", "open").neq("request_id", request.id);
  const clash = (others ?? []).filter((o) => overlaps(startsAt, durationMin, o.starts_at as string, o.duration_min as number)).map((o) => o.id as string);
  if (clash.length > 0) await admin.from("interview_slots").update({ status: "withdrawn" }).in("id", clash);

  await mailScheduledOnline(admin, { ...request, status: "scheduled", scheduled_at: startsAt, duration_min: durationMin, meet_url: co.meet_room_url }, co.name, origin);
  return NextResponse.json({ ok: true, scheduled_at: startsAt, meet_url: co.meet_room_url });
}
