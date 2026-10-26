import type { SupabaseClient } from "@supabase/supabase-js";
import { officeEmails, sendMails } from "@/lib/plan-server";
import { formatDateJa, formatSlot, jstDateOf, type ScheduleMode } from "@/lib/interview-schedule";

// 面接指導の日程調整のサーバー側(申出の読み込み・候補の取り下げ・メール)

export type RequestRow = {
  id: string;
  user_id: string;
  company_id: string;
  status: "pending" | "scheduled" | "done" | "cancelled";
  schedule_mode: ScheduleMode | null;
  slots_offered_at: string | null;
  scheduled_at: string | null;
  duration_min: number | null;
  meet_url: string | null;
  visit_note: string | null;
};

export async function loadRequest(admin: SupabaseClient, id: unknown): Promise<RequestRow | null> {
  if (typeof id !== "string" || !id) return null;
  const { data } = await admin.from("interview_requests").select("*").eq("id", id).maybeSingle();
  return (data as RequestRow | null) ?? null;
}

// 企業名と面談ルームのURL。ストレスチェックWebで未登録なら、健康管理Webの産業医面談ルーム(hm_meet_rooms)を使う
export async function companyInfo(admin: SupabaseClient, companyId: string): Promise<{ name: string; meet_room_url: string | null }> {
  const { data } = await admin.from("companies").select("name, meet_room_url").eq("id", companyId).maybeSingle();
  const name = (data?.name as string | undefined) ?? "(不明)";
  const own = ((data?.meet_room_url as string | null | undefined) ?? "").trim();
  if (own) return { name, meet_room_url: own };
  return { name, meet_room_url: await kenkoMeetRoom(admin, companyId) };
}

// 健康管理Webの産業医面談ルーム(健康管理Webを使っていない環境では表がないので null)
export async function kenkoMeetRoom(admin: SupabaseClient, companyId: string): Promise<string | null> {
  const { data, error } = await admin.from("hm_meet_rooms").select("meeting_uri, enabled").eq("company_id", companyId).maybeSingle();
  if (error || !data?.enabled) return null;
  return ((data.meeting_uri as string | null) ?? "").trim() || null;
}

export async function userEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

export async function jimuEmails(admin: SupabaseClient, companyId: string): Promise<string[]> {
  const { data } = await admin.from("profiles").select("user_id").eq("role", "jimu").eq("company_id", companyId);
  const out: string[] = [];
  for (const j of data ?? []) {
    const e = await userEmail(admin, j.user_id as string);
    if (e) out.push(e);
  }
  return out;
}

// すでに確定しているオンライン面談(医師は1人なので、企業をまたいで重ならないようにする)
export async function bookedInterviews(admin: SupabaseClient, excludeRequestId?: string): Promise<{ starts_at: string; duration_min: number }[]> {
  let q = admin
    .from("interview_requests")
    .select("id, scheduled_at, duration_min")
    .eq("status", "scheduled")
    .eq("schedule_mode", "online")
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  if (excludeRequestId) q = q.neq("id", excludeRequestId);
  const { data } = await q;
  return (data ?? []).map((r) => ({ starts_at: r.scheduled_at as string, duration_min: (r.duration_min as number | null) ?? 30 }));
}

// 申出の未選択の候補を取り下げる
export async function withdrawOpenSlots(admin: SupabaseClient, requestId: string): Promise<void> {
  await admin.from("interview_slots").update({ status: "withdrawn" }).eq("request_id", requestId).eq("status", "open");
}

// ---- メール(本文に本人の氏名・相談内容は書かない) ----

export async function mailSlotsOffered(admin: SupabaseClient, req: RequestRow, dates: string[], origin: string): Promise<void> {
  const email = await userEmail(admin, req.user_id);
  if (!email) return;
  await sendMails(
    [email],
    "【ストレスチェックWeb】面接指導の候補日時が届きました",
    [
      "産業医面接指導の日程について、医師から候補の日時が届きました。",
      "下のリンクからログインし、マイページで都合のよい日時を1つ選んでください。選んだ時点で日程が確定し、オンライン面談のURLをお知らせします。",
      "",
      `候補のある日: ${dates.map(formatDateJa).join("、")}`,
      "",
      `${origin}/login?next=/my`,
      "",
      "※候補はほかの方の面談が確定すると変わることがあります。お早めにお選びください。",
    ].join("\n")
  );
}

export async function mailScheduledOnline(admin: SupabaseClient, req: RequestRow, companyName: string, origin: string): Promise<void> {
  if (!req.scheduled_at) return;
  const when = formatSlot(req.scheduled_at, req.duration_min);
  const email = await userEmail(admin, req.user_id);
  if (email) {
    await sendMails(
      [email],
      "【ストレスチェックWeb】面接指導の日時が確定しました",
      [
        "産業医面接指導の日時が確定しました。",
        "",
        `日時: ${when}`,
        `方法: オンライン(Google Meet)`,
        `面談のURL: ${req.meet_url ?? "(マイページでご確認ください)"}`,
        "",
        "当日は、時間になったら上のURLを開いてください。静かな場所で、カメラとマイクが使える端末(スマートフォンでも可)をご用意ください。",
        `予定に入れる(カレンダー用ファイル): ${origin}/api/interview/ics?requestId=${req.id}`,
        `マイページ: ${origin}/login?next=/my`,
        "",
        "都合が悪くなった場合は、マイページから日程を取り消して選び直せます。",
      ].join("\n")
    );
  }
  await sendMails(
    await officeEmails(admin),
    "【ストレスチェックWeb】面接指導の日時が確定しました",
    [
      "面接指導の申出者が候補日時を選び、日程が確定しました。",
      "",
      `企業名: ${companyName}`,
      `日時: ${when}`,
      `方法: オンライン(${req.meet_url ?? "URL未設定"})`,
      `ログイン: ${origin}/office`,
    ].join("\n")
  );
}

export async function mailVisitScheduled(admin: SupabaseClient, req: RequestRow, companyName: string, origin: string): Promise<void> {
  if (!req.scheduled_at) return;
  const date = formatDateJa(jstDateOf(req.scheduled_at));
  const email = await userEmail(admin, req.user_id);
  if (email) {
    await sendMails(
      [email],
      "【ストレスチェックWeb】面接指導は次回の産業医訪問日に行います",
      [
        "産業医面接指導は、産業医が会社を訪問する次回の日に、対面で行います。",
        "",
        `訪問日: ${date}`,
        ...(req.visit_note ? [`補足: ${req.visit_note}`] : []),
        "",
        "当日の時間と場所は、会社のストレスチェック担当者からご連絡します。",
        `マイページ: ${origin}/login?next=/my`,
      ].join("\n")
    );
  }
  await sendMails(
    await jimuEmails(admin, req.company_id),
    "【ストレスチェックWeb】面接指導の時間の調整をお願いします(次回訪問日)",
    [
      "面接指導の申出について、医師が次回の訪問日に対面で行うことにしました。",
      "ログインして面接指導申出の一覧で対象の方を確認し、当日の時間と場所を本人に伝えてください。",
      "",
      `企業名: ${companyName}`,
      `訪問日: ${date}`,
      ...(req.visit_note ? [`医師からの補足: ${req.visit_note}`] : []),
      `ログイン: ${origin}/jimu`,
    ].join("\n")
  );
}

export async function mailScheduleCancelled(admin: SupabaseClient, req: RequestRow, origin: string, by: "doctor" | "self"): Promise<void> {
  const email = await userEmail(admin, req.user_id);
  if (email && by === "doctor") {
    await sendMails(
      [email],
      "【ストレスチェックWeb】面接指導の日程が取り消されました",
      [
        "医師の都合により、確定していた面接指導の日程を取り消しました。あらためて候補の日時をお知らせしますので、お待ちください。",
        `マイページ: ${origin}/login?next=/my`,
      ].join("\n")
    );
  }
  if (by === "self") {
    await sendMails(
      await officeEmails(admin),
      "【ストレスチェックWeb】面接指導の日程が本人により取り消されました",
      ["面接指導の申出者が、確定していた日程を取り消しました。残っている候補から選び直すか、候補を出し直してください。", `ログイン: ${origin}/office`].join("\n")
    );
  }
}
