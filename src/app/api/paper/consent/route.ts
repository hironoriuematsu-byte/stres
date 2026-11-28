import { NextResponse } from "next/server";
import { staffContext } from "@/lib/no-email-server";

export const runtime = "nodejs";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

// 紙で受検した方の「会社への結果の提供の同意」を記録する(実施者・誓約済みの実施事務従事者)。
// 同意は、本人が結果票を受け取って結果を見たあとに、書面(同意書)でもらう。
// 画面から受検した方は本人が自分で同意・撤回できるので、ここでは紙の結果だけを扱う
export async function POST(req: Request) {
  let body: { companyId?: unknown; resultId?: unknown; consent?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const ctx = await staffContext(req, companyId);
  if (!ctx.ok) return fail(ctx.status, ctx.error);
  const resultId = typeof body.resultId === "string" ? body.resultId : "";
  const consent = body.consent === true;
  const { data: r, error } = await ctx.admin.from("results").select("id, company_id, exam_method").eq("id", resultId).maybeSingle();
  if (error) return fail(503, "準備がまだです(SQL 0034 を実行してください)");
  if (!r || r.company_id !== companyId) return fail(404, "結果が見つかりません");
  if (r.exam_method !== "paper") return fail(400, "画面から受検した方の同意は、ご本人がマイページで変更します");
  const { error: upErr } = await ctx.admin.from("results").update({ consent }).eq("id", resultId);
  if (upErr) return fail(500, `記録できませんでした: ${upErr.message}`);
  await ctx.admin.from("access_logs").insert({ user_id: ctx.userId, role: ctx.role, action: consent ? "paper_consent_recorded" : "paper_consent_withdrawn", target: resultId, company_id: companyId });
  return NextResponse.json({ ok: true, consent });
}
