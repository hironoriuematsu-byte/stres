import { NextResponse } from "next/server";
import { fail, intakeContext, loadIntake, shareToCompany, siteOrigin } from "@/lib/intake-api";

export const runtime = "nodejs";

// 会社の担当者(実施事務従事者)への共有を、医師(実施者)が直して送り直す。
// (共有は本人が問診を終えたときに自動で送られる。本人が選んだ範囲のみ)
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, role } = ctx;
  if (role !== "office") return fail(403, "共有できるのは実施者(医師)だけです");

  let body: { intakeId?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const intake = await loadIntake(admin, body.intakeId);
  if (!intake) return fail(404, "事前問診が見つかりません");
  if (!intake.share_consent || intake.share_consent.keys.length === 0) return fail(400, "本人が会社への共有を選んでいません");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return fail(400, "共有する文章を入力してください");
  if (text.length > 2000) return fail(400, "共有する文章は2000文字までにしてください");

  const err = await shareToCompany(admin, intake, text, userId, siteOrigin(req));
  if (err) return fail(500, err);
  await admin.from("access_logs").insert({ user_id: userId, role: "office", action: "intake_shared_to_company", target: intake.id, company_id: intake.company_id });
  return NextResponse.json({ ok: true });
}
