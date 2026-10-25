import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getFiscalYear } from "@/lib/fiscal";
import { siteOrigin } from "@/lib/intake-api";
import {
  MANUAL_REMIND_ACTION,
  MANUAL_REMIND_INTERVAL_HOURS,
  canSendAgain,
  examBlockReason,
  lastManualRemind,
  sendUnexaminedReminders,
  unexaminedMembers,
} from "@/lib/exam-reminder";
import { remindContext } from "../_auth";

export const runtime = "nodejs";
export const maxDuration = 300;

// 未受検者にリマインドのメールを送る(実施者・実施事務従事者)。同じ企業へは24時間に1回まで
export async function POST(req: Request) {
  let body: { companyId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const ctx = await remindContext(req, companyId);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin } = ctx;
  const fy = getFiscalYear();

  const block = await examBlockReason(admin, companyId, fy);
  if (block) return NextResponse.json({ error: `${block}。リマインドは送れません。` }, { status: 400 });
  const last = await lastManualRemind(admin, companyId, fy);
  if (!canSendAgain(last?.at ?? null)) {
    return NextResponse.json({ error: `前回の送信から${MANUAL_REMIND_INTERVAL_HOURS}時間たつまでは、送れません(同じ方に何通も届かないようにするため)。` }, { status: 429 });
  }
  const { members } = await unexaminedMembers(admin, companyId, fy);
  if (members.length === 0) return NextResponse.json({ error: "未受検の方はいません" }, { status: 400 });

  // 先に記録して二重送信を防ぎ、メールは裏で送る(人数が多いと時間がかかるため)
  await admin.from("access_logs").insert({ user_id: ctx.userId, role: ctx.role, action: MANUAL_REMIND_ACTION, target: `fy=${fy} count=${members.length}`, company_id: companyId });
  const origin = siteOrigin(req);
  waitUntil(sendUnexaminedReminders(admin, companyId, fy, members, origin).catch((e) => console.error("exam remind failed", e)));
  return NextResponse.json({ ok: true, count: members.length });
}
