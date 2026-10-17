import { NextResponse } from "next/server";
import { fail, intakeContext } from "@/lib/intake-api";

export const runtime = "nodejs";

// 本人が「今回は受けない」を選んだ(以降は催促しない)
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId } = ctx;
  let body: { requestId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const { data: request } = await admin
    .from("interview_requests")
    .select("id, user_id, company_id")
    .eq("id", typeof body.requestId === "string" ? body.requestId : "")
    .maybeSingle();
  if (!request || request.user_id !== userId) return fail(404, "申出が見つかりません");
  const now = new Date().toISOString();
  const { data: cur } = await admin.from("interview_intake_invites").select("*").eq("request_id", request.id).maybeSingle();
  await admin.from("interview_intake_invites").upsert({
    request_id: request.id,
    company_id: request.company_id,
    first_sent_at: cur?.first_sent_at ?? null,
    last_sent_at: cur?.last_sent_at ?? null,
    sent_count: cur?.sent_count ?? 0,
    declined_at: now,
    updated_at: now,
  });
  return NextResponse.json({ ok: true });
}
