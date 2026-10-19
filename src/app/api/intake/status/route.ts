import { NextResponse } from "next/server";
import { intakeConfigured, intakeEligible } from "@/lib/intake-server";
import { fail, intakeContext } from "@/lib/intake-api";

export const runtime = "nodejs";

// 本人の申出で事前問診を使えるか、と進み具合(マイページの案内用)
export async function GET(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId } = ctx;
  const requestId = new URL(req.url).searchParams.get("requestId") ?? "";
  const { data: request } = await admin
    .from("interview_requests")
    .select("id, user_id, company_id, created_at, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.user_id !== userId) return fail(404, "申出が見つかりません");
  const { data: intake } = await admin
    .from("interview_intakes")
    .select("id, status, risk_level, reply, reply_sent_at")
    .eq("request_id", request.id)
    .maybeSingle();
  const open = request.status === "pending" || request.status === "scheduled";
  const available = intakeConfigured() && open && (await intakeEligible(admin, request));
  return NextResponse.json({ available, intake: intake ?? null });
}
