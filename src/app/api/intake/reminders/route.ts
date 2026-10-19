import { NextResponse } from "next/server";
import { adminClient } from "@/lib/plan-server";
import { intakeConfigured, intakeEligible } from "@/lib/intake-server";
import { INTAKE_MAX_SENDS, sendIntakeInvite, shouldRemind, type InviteRow } from "@/lib/intake-invite";

export const runtime = "nodejs";
export const maxDuration = 120;

// 事前問診の催促(毎日1回、Vercel Cron から呼ばれる)。
// 案内したのに受けていない・途中でやめた人へ、最後の案内から3日ごとに最大2回まで再送する
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "no service key" }, { status: 500 });
  if (!intakeConfigured()) return NextResponse.json({ skipped: "ANTHROPIC_API_KEY が未設定" });

  const { data: invites } = await admin
    .from("interview_intake_invites")
    .select("*")
    .is("declined_at", null)
    .lt("sent_count", INTAKE_MAX_SENDS);
  const rows = (invites as InviteRow[] | null) ?? [];
  if (rows.length === 0) return NextResponse.json({ sent: 0 });
  const ids = rows.map((r) => r.request_id);
  const [{ data: requests }, { data: intakes }] = await Promise.all([
    admin.from("interview_requests").select("id, user_id, company_id, created_at, status").in("id", ids),
    admin.from("interview_intakes").select("request_id, status").in("request_id", ids),
  ]);
  const reqOf = new Map((requests ?? []).map((r) => [r.id as string, r]));
  const intakeOf = new Map((intakes ?? []).map((i) => [i.request_id as string, i.status as string]));

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const now = new Date();
  let sent = 0;
  for (const inv of rows) {
    const r = reqOf.get(inv.request_id);
    if (!r) continue;
    const st = intakeOf.get(inv.request_id) ?? null;
    if (!shouldRemind(inv, st, r.status, now)) continue;
    if (!(await intakeEligible(admin, r))) continue;
    if (await sendIntakeInvite(admin, r, origin, "remind", st === "in_progress")) sent++;
  }
  return NextResponse.json({ sent });
}
