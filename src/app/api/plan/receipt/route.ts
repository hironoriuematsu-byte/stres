import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/plan-server";
import { receiptPageUrl, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

// 領収書: 申込(支払い)ごとに、Stripe の領収書ページ(請求書・領収書のPDFをダウンロードできる)へ移動する。
// 見られるのは、その企業の実施事務従事者と実施者のみ
export async function GET(req: Request) {
  const orderId = new URL(req.url).searchParams.get("order") ?? "";
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/jimu`, req.url));

  const admin = adminClient();
  if (!admin || !stripeConfigured()) return new NextResponse("現在、領収書を表示できません。", { status: 503 });

  const [{ data: me }, { data: order }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("user_id", user.id).single(),
    admin.from("plan_orders").select("company_id, status, stripe_invoice_id, stripe_session_id").eq("id", orderId).maybeSingle(),
  ]);
  const allowed = me && order && (me.role === "office" || (me.role === "jimu" && me.company_id === order.company_id));
  if (!allowed) return new NextResponse("領収書が見つかりません。", { status: 404 });
  if (order.status !== "provisioned" && order.status !== "paid") {
    return new NextResponse("このお申込みはお支払いが完了していません。", { status: 404 });
  }

  try {
    const url = await receiptPageUrl({ invoiceId: order.stripe_invoice_id, sessionId: order.stripe_session_id });
    if (!url) return new NextResponse("領収書の準備ができていません。しばらくしてからもう一度お試しください。", { status: 404 });
    return NextResponse.redirect(url);
  } catch {
    return new NextResponse("領収書を取得できませんでした。しばらくしてからもう一度お試しください。", { status: 502 });
  }
}
