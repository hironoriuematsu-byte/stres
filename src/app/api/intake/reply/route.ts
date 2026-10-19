import { NextResponse } from "next/server";
import { sendMails } from "@/lib/plan-server";
import { fail, intakeContext, loadIntake, siteOrigin } from "@/lib/intake-api";

export const runtime = "nodejs";

// 医師(実施者)が確認した返信を本人に送る。メールには内容を書かず、ログインして読んでもらう
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, userId, role } = ctx;
  if (role !== "office") return fail(403, "返信できるのは実施者(医師)だけです");

  let body: { intakeId?: unknown; reply?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const intake = await loadIntake(admin, body.intakeId);
  if (!intake) return fail(404, "事前問診が見つかりません");
  const reply = typeof body.reply === "string" ? body.reply.trim() : "";
  if (!reply) return fail(400, "返信の文章を入力してください");
  if (reply.length > 4000) return fail(400, "返信は4000文字までにしてください");

  const now = new Date().toISOString();
  const { error } = await admin
    .from("interview_intakes")
    .update({ reply, reply_sent_at: now, reply_sent_by: userId, updated_at: now })
    .eq("id", intake.id);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);
  await admin.from("access_logs").insert({ user_id: userId, role: "office", action: "intake_reply_sent", target: intake.id, company_id: intake.company_id });

  const { data: u } = await admin.auth.admin.getUserById(intake.user_id);
  if (u?.user?.email) {
    await sendMails(
      [u.user.email],
      "【ストレスチェックWeb】面接指導について医師から返信があります",
      [
        "面接指導のお申し出について、医師(産業医)から返信があります。",
        "ストレスチェックWebにログインし、マイページでご確認ください。",
        "",
        `${siteOrigin(req)}/my`,
        "",
        "※このメールには返信の内容は記載していません。",
      ].join("\n")
    );
  }
  return NextResponse.json({ ok: true });
}
