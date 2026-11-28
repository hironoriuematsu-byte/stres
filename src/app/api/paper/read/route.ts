import { NextResponse } from "next/server";
import { staffContext } from "@/lib/no-email-server";
import { PAPER_MAX_BASE64_CHARS, PAPER_MAX_FILES, PAPER_MEDIA_TYPES, paperReadConfigured, readPaperAnswers, type PaperFile } from "@/lib/paper-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

// 紙の回答用紙の写真・スキャンをAIで読み取る(実施者・誓約済みの実施事務従事者)。
// 読み取り結果は画面に返すだけで、保存はしない(画像も保存しない)
export async function POST(req: Request) {
  let body: { companyId?: unknown; questionnaire?: unknown; files?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "ファイルが大きすぎるか、形式が不正です。枚数を減らすか、写真を撮り直してください。");
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : "";
  const ctx = await staffContext(req, companyId);
  if (!ctx.ok) return fail(ctx.status, ctx.error);
  if (!paperReadConfigured()) return fail(503, "AIの読み取りは準備中です(ANTHROPIC_API_KEY が未設定)。手で入力してください。");

  const questionnaire = body.questionnaire === "80" ? "80" : "57";
  const files: PaperFile[] = (Array.isArray(body.files) ? (body.files as unknown[]) : [])
    .map((f) => (f ?? {}) as Record<string, unknown>)
    .filter((f) => typeof f.data === "string" && (PAPER_MEDIA_TYPES as readonly string[]).includes(String(f.mediaType)))
    .map((f) => ({ mediaType: f.mediaType as PaperFile["mediaType"], data: f.data as string }));
  if (files.length === 0) return fail(400, "回答用紙の写真またはPDFを選んでください");
  if (files.length > PAPER_MAX_FILES) return fail(400, `一度に読み取れるのは${PAPER_MAX_FILES}枚までです`);
  if (files.reduce((s, f) => s + f.data.length, 0) > PAPER_MAX_BASE64_CHARS) return fail(400, "ファイルが大きすぎます。枚数を減らすか、写真を撮り直してください。");

  try {
    const r = await readPaperAnswers(files, questionnaire);
    // 費用のかかる操作なので記録する(誰の用紙かは記録しない。画像も残さない)
    await ctx.admin.from("access_logs").insert({ user_id: ctx.userId, role: ctx.role, action: "paper_ai_read", target: `files=${files.length} read=${r.read}`, company_id: companyId });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("paper read failed", e);
    return fail(502, "AIの読み取りに失敗しました。もう一度試すか、手で入力してください。");
  }
}
