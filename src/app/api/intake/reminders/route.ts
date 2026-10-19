import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/plan-server";
import { intakeConfigured, intakeEligible } from "@/lib/intake-server";
import { INTAKE_MAX_SENDS, sendIntakeInvite, shouldRemind, type InviteRow } from "@/lib/intake-invite";
import { needsPartialSummary } from "@/lib/intake";
import { saveSummary, type IntakeRow } from "@/lib/intake-api";

export const runtime = "nodejs";
export const maxDuration = 300;

const PARTIAL_PER_RUN = 3; // 1回で作る途中までの要約の数(1件に数十秒かかるため)

// 途中でやめたまま日数がたった問診は、途中までの内容で医師向けの要約を作る(本人は続きから再開できる)
async function partialSummaries(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from("interview_intakes").select("*").eq("status", "in_progress");
  const now = new Date();
  const targets = ((data as IntakeRow[] | null) ?? [])
    .filter((i) => needsPartialSummary({ ...i, summary: i.summary as { generated_at?: string } | null }, now))
    .slice(0, PARTIAL_PER_RUN);
  if (targets.length === 0) return 0;
  const { data: requests } = await admin
    .from("interview_requests")
    .select("id, status")
    .in("id", targets.map((t) => t.request_id));
  const open = new Set((requests ?? []).filter((r) => r.status === "pending" || r.status === "scheduled").map((r) => r.id as string));
  let made = 0;
  for (const t of targets) {
    if (!open.has(t.request_id)) continue;
    if ((await saveSummary(admin, t, null, true)) === null) made++;
  }
  return made;
}

// 事前問診の催促(毎日1回、Vercel Cron から呼ばれる)。
// 案内したのに受けていない・途中でやめた人へ、最後の案内から3日ごとに最大2回まで再送する。
// あわせて、途中でやめたままの問診は、途中までの内容で要約を作る
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
  const partial = await partialSummaries(admin);
  if (rows.length === 0) return NextResponse.json({ sent: 0, partial });
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
  return NextResponse.json({ sent, partial });
}
