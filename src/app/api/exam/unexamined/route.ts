import { NextResponse } from "next/server";
import { getFiscalYear } from "@/lib/fiscal";
import { canSendAgain, examBlockReason, lastManualRemind, unexaminedMembers } from "@/lib/exam-reminder";
import { remindContext } from "../_auth";

export const runtime = "nodejs";

// 当年度の未受検者(アカウント登録済みで結果がない人)と、前回のリマインドの送信状況
export async function GET(req: Request) {
  const companyId = new URL(req.url).searchParams.get("companyId") ?? "";
  const ctx = await remindContext(req, companyId);
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const fy = getFiscalYear();
  const [{ registered, members }, last, block] = await Promise.all([
    unexaminedMembers(ctx.admin, companyId, fy),
    lastManualRemind(ctx.admin, companyId, fy),
    examBlockReason(ctx.admin, companyId, fy),
  ]);
  return NextResponse.json({ fiscalYear: fy, registered, members, last, canSend: canSendAgain(last?.at ?? null), block });
}
