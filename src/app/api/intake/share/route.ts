import { NextResponse } from "next/server";
import { sendMails } from "@/lib/plan-server";
import { fail, intakeContext, loadIntake, siteOrigin } from "@/lib/intake-api";

export const runtime = "nodejs";

// 医師(実施者)が確認した内容を、会社の担当者(実施事務従事者)に共有する。
// 本人が選んだ範囲のみ。メールには内容を書かず、ログインして読んでもらう
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

  const now = new Date().toISOString();
  const { error } = await admin
    .from("interview_intakes")
    .update({ company_share: text, company_shared_at: now, company_shared_by: userId, updated_at: now })
    .eq("id", intake.id);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);
  await admin.from("access_logs").insert({ user_id: userId, role: "office", action: "intake_shared_to_company", target: intake.id, company_id: intake.company_id });

  // 会社の担当者(実施事務従事者)に知らせる
  const { data: jimus } = await admin.from("profiles").select("user_id").eq("role", "jimu").eq("company_id", intake.company_id);
  const emails: string[] = [];
  for (const j of jimus ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(j.user_id);
    if (u?.user?.email) emails.push(u.user.email);
  }
  await sendMails(
    emails,
    "【ストレスチェックWeb】面接指導の申出について医師から共有があります",
    [
      "面接指導の申出について、医師(産業医)から面談の準備のための情報が共有されました。",
      "ログインして、面接指導申出の一覧で確認してください(本人の同意を得た範囲の内容です)。",
      "",
      `${siteOrigin(req)}/jimu`,
      "",
      "※このメールには内容は記載していません。実施事務従事者として守秘義務があります。",
    ].join("\n")
  );
  return NextResponse.json({ ok: true });
}
