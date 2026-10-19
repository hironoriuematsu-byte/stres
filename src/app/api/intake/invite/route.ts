import { NextResponse } from "next/server";
import { intakeConfigured, intakeEligible } from "@/lib/intake-server";
import { sendIntakeInvite } from "@/lib/intake-invite";
import { fail, intakeContext, siteOrigin } from "@/lib/intake-api";

export const runtime = "nodejs";
export const maxDuration = 120;

// 実施者(医師)が、申出者に事前問診の案内を送る(この機能の前に申出をした人への案内にも使う)
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, role } = ctx;
  if (role !== "office") return fail(403, "案内を送れるのは実施者(医師)だけです");
  if (!intakeConfigured()) return fail(503, "事前問診は現在ご利用いただけません(ANTHROPIC_API_KEY が未設定です)");

  let body: { requestIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const ids = Array.isArray(body.requestIds) ? body.requestIds.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  if (ids.length === 0) return fail(400, "申出が指定されていません");

  const { data: requests } = await admin
    .from("interview_requests")
    .select("id, user_id, company_id, created_at, status")
    .in("id", ids);
  const { data: intakes } = await admin.from("interview_intakes").select("request_id, status").in("request_id", ids);
  const { data: invites } = await admin.from("interview_intake_invites").select("request_id, declined_at").in("request_id", ids);
  const intakeOf = new Map((intakes ?? []).map((i) => [i.request_id as string, i.status as string]));
  const declined = new Set((invites ?? []).filter((i) => i.declined_at).map((i) => i.request_id as string));

  const origin = siteOrigin(req);
  let sent = 0;
  const skipped: string[] = [];
  for (const r of requests ?? []) {
    const st = intakeOf.get(r.id);
    if (r.status !== "pending" && r.status !== "scheduled") skipped.push("面接指導が終了・取消");
    else if (st && st !== "in_progress") skipped.push("事前問診済み");
    else if (declined.has(r.id)) skipped.push("本人が「受けない」を選択");
    else if (!(await intakeEligible(admin, r))) skipped.push("対象外の企業(自社で医師に依頼)");
    else if (await sendIntakeInvite(admin, r, origin, "invite", st === "in_progress")) sent++;
    else skipped.push("メールアドレスなし");
  }
  return NextResponse.json({ sent, skipped });
}
