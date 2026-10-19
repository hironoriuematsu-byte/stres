import { NextResponse } from "next/server";
import { INTAKE_FIRST_MESSAGE, type IntakeMessage } from "@/lib/intake";
import { intakeConfigured, intakeEligible } from "@/lib/intake-server";
import { fail, intakeContext } from "@/lib/intake-api";

export const runtime = "nodejs";

// 事前問診を始める(本人のみ)。同意のうえで開始し、同じ申出では1回だけ作る
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  if (!intakeConfigured()) return fail(503, "事前問診は現在ご利用いただけません");
  const { admin, userId } = ctx;

  let body: { requestId?: unknown; consent?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  if (body.consent !== true) return fail(400, "事前問診への同意が必要です");
  if (typeof body.requestId !== "string") return fail(400, "申出が指定されていません");

  const { data: request } = await admin
    .from("interview_requests")
    .select("id, user_id, company_id, created_at, status")
    .eq("id", body.requestId)
    .maybeSingle();
  if (!request || request.user_id !== userId) return fail(404, "申出が見つかりません");
  if (request.status === "done" || request.status === "cancelled") return fail(400, "この申出の面接指導は終了しています");
  if (!(await intakeEligible(admin, request))) return fail(400, "この申出では事前問診を利用できません");

  const { data: existing } = await admin.from("interview_intakes").select("id").eq("request_id", request.id).maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id });

  const first: IntakeMessage = { role: "assistant", content: INTAKE_FIRST_MESSAGE, at: new Date().toISOString() };
  const { data: created, error } = await admin
    .from("interview_intakes")
    .insert({ request_id: request.id, user_id: userId, company_id: request.company_id, messages: [first] })
    .select("id")
    .single();
  if (error || !created) return fail(500, `開始できませんでした: ${error?.message ?? ""}`);
  return NextResponse.json({ id: created.id });
}
