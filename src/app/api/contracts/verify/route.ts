import { NextResponse } from "next/server";
import { verifyChain, verifyServiceSignature } from "@/lib/contract-crypto";
import { fail, loadEvents, publicContext } from "@/lib/contract-server";

export const runtime = "nodejs";

// 契約書の真正性の確認(ログイン不要)。契約番号と文面のハッシュを渡すと、
// 締結済みの契約の文面と一致するか・記録の連鎖と事業者署名が有効かを返す。
// 契約の内容(当事者名・金額など)は返さない
export async function GET(req: Request) {
  const ctx = publicContext();
  if (!ctx.ok) return ctx.res;
  const url = new URL(req.url);
  const no = (url.searchParams.get("no") ?? "").trim().toUpperCase();
  const hash = (url.searchParams.get("hash") ?? "").trim().toLowerCase();
  if (!/^E\d{4}-[0-9A-F]{8}$/.test(no)) return fail(400, "契約番号の形式が違います(例: E2026-3F2A9C1E)");
  if (!/^[0-9a-f]{64}$/.test(hash)) return fail(400, "文面のハッシュ(SHA-256・64桁の英数字)を入力してください");

  const { data } = await ctx.admin
    .from("contracts")
    .select("id, status, document_hash, completion_hash, service_signature, signed_at")
    .eq("contract_no", no)
    .maybeSingle();
  if (!data || data.status !== "signed") return NextResponse.json({ found: false });

  const events = await loadEvents(ctx.admin, data.id);
  const documentMatches = data.document_hash === hash;
  const chainValid = events.length > 0 && verifyChain(events) && events.some((e) => e.event === "signed" && e.hash === data.completion_hash);
  const signatureValid = data.service_signature ? verifyServiceSignature(data.document_hash ?? "", data.completion_hash ?? "", data.service_signature) : null;
  return NextResponse.json({ found: true, signedAt: data.signed_at, documentMatches, chainValid, signatureValid });
}
