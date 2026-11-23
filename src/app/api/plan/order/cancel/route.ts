import { NextResponse } from "next/server";
import { requestUser } from "@/lib/supabase/server";
import { adminClient, officeEmails, orderSummary, sendMails } from "@/lib/plan-server";
import { cancelTransferOrder, type BankOrder } from "@/lib/plan-bank";
import { stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

// お振込み待ちのお申込みを取り消す(自社の実施事務従事者・実施者)。
// まだ入金のないものだけ取り消せる(Stripe 側の決済も取り消すので、このあと振り込んでも充てられない)
export async function POST(req: Request) {
  if (!stripeConfigured()) return NextResponse.json({ error: "現在、お手続きできません。実施者にご連絡ください。" }, { status: 503 });
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });

  let orderId = "";
  try {
    orderId = String((await req.json()).orderId ?? "");
  } catch {
    /* fallthrough */
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: "お申込みが指定されていません" }, { status: 400 });

  const [{ data: me }, { data: order }] = await Promise.all([
    admin.from("profiles").select("role, name, company_id").eq("user_id", user.id).single(),
    admin.from("plan_orders").select("*").eq("id", orderId).maybeSingle<BankOrder>(),
  ]);
  const allowed = me && order && (me.role === "office" || (me.role === "jimu" && me.company_id && me.company_id === order.company_id));
  if (!allowed || !order) return NextResponse.json({ error: "お申込みが見つかりません" }, { status: 404 });

  const r = await cancelTransferOrder(admin, order, me.role === "office" ? "実施者が取り消しました" : "担当者が取り消しました");
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  await admin.from("access_logs").insert({
    user_id: user.id,
    role: me.role,
    action: "plan_order_cancel",
    target: `${order.fiscal_year}年度 ${order.kind === "add_seats" ? "人数の追加" : "お申込み"} ${order.amount.toLocaleString()}円(お振込み待ち)`,
    company_id: order.company_id,
  });
  await sendMails(
    await officeEmails(admin),
    "【ストレスチェックWeb】お振込み待ちの申込が取り消されました",
    `${orderSummary(order, order.seats_granted ?? order.seats)}\n\n${me.role === "office" ? "実施者" : `担当者(${me.name})`}の操作で取り消されました。`
  );
  return NextResponse.json({ ok: true });
}
