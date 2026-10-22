import { NextResponse } from "next/server";
import { fail, intakeContext } from "@/lib/intake-api";
import { validMeetUrl } from "@/lib/interview-schedule";

export const runtime = "nodejs";

// 企業ごとの産業医面談ルーム(Google Meet など)のURLを登録する(実施者のみ)。空にすると消す
export async function POST(req: Request) {
  const ctx = await intakeContext(req);
  if (!ctx.ok) return ctx.res;
  const { admin, role } = ctx;
  if (role !== "office") return fail(403, "登録できるのは実施者(医師)だけです");
  let body: { companyId?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  if (typeof body.companyId !== "string") return fail(400, "企業が指定されていません");
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (url && !validMeetUrl(url)) return fail(400, "https:// から始まるURLを入れてください");
  const { error } = await admin.from("companies").update({ meet_room_url: url || null }).eq("id", body.companyId);
  if (error) return fail(500, `保存できませんでした: ${error.message}`);
  return NextResponse.json({ ok: true, url: url || null });
}
