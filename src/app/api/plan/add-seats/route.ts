import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_SEATS, priceAdd } from "@/lib/plan";
import { loadPricing } from "@/lib/plan-prices";
import { adminClient, invoiceFields } from "@/lib/plan-server";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";
import { getFiscalYear } from "@/lib/fiscal";

export const runtime = "nodejs";

// 受検人数の追加購入(自社の実施事務従事者が操作)。決済完了の Webhook で人数枠に加算される
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "現在、オンラインでの追加購入は準備中です。実施者にご連絡ください。" }, { status: 503 });
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });

  const { data: me } = await admin.from("profiles").select("role, name, company_id").eq("user_id", user.id).single();
  if (!me || me.role !== "jimu" || !me.company_id) {
    return NextResponse.json({ error: "人数の追加購入は、自社の実施事務従事者のみ行えます" }, { status: 403 });
  }

  let seats = NaN;
  let fiscalYear = getFiscalYear();
  try {
    const body = await req.json();
    seats = Number(body.seats);
    if (Number.isInteger(body.fiscalYear)) fiscalYear = body.fiscalYear;
  } catch {
    /* fallthrough */
  }
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
    return NextResponse.json({ error: `追加する人数は1〜${MAX_SEATS}名で入力してください` }, { status: 400 });
  }

  const [{ data: plan }, { data: company }, { data: firstOrder }] = await Promise.all([
    admin.from("exam_plans").select("exam_end, max_end").eq("company_id", me.company_id).eq("fiscal_year", fiscalYear).maybeSingle(),
    admin.from("companies").select("name, web_signup").eq("id", me.company_id).single(),
    admin
      .from("plan_orders")
      .select("office_name, address, contact_phone, workers")
      .eq("company_id", me.company_id)
      .eq("kind", "new")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  if (!plan) return NextResponse.json({ error: "この年度のWeb申込が見つかりません" }, { status: 404 });
  if (!company?.web_signup) {
    return NextResponse.json({ error: "顧問契約の企業は人数の上限がないため、追加は不要です" }, { status: 400 });
  }

  // 単価は、その年度に申し込んだときの単価(年度の途中で料金を改定しても、申込済みの企業の追加は変わらない)
  const { data: base } = await admin
    .from("plan_orders")
    .select("unit_price")
    .eq("company_id", me.company_id)
    .eq("fiscal_year", fiscalYear)
    .in("kind", ["new", "renew"])
    .in("status", ["paid", "provisioned"])
    .not("unit_price", "is", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  const pricing = await loadPricing(admin, fiscalYear);
  if (base?.unit_price) pricing.unitPrice = base.unit_price as number;
  const price = priceAdd(seats, pricing);
  const email = user.email ?? "";
  const { data: order, error } = await admin
    .from("plan_orders")
    .insert({
      kind: "add_seats",
      company_id: me.company_id,
      fiscal_year: fiscalYear,
      seats,
      amount: price.total,
      company_name: company?.name ?? "",
      office_name: firstOrder?.office_name ?? null,
      address: firstOrder?.address ?? null,
      contact_name: me.name,
      contact_email: email,
      contact_phone: firstOrder?.contact_phone ?? null,
      workers: firstOrder?.workers ?? null,
    })
    .select("id")
    .single();
  if (order) await admin.from("plan_orders").update({ unit_price: pricing.unitPrice, seats_granted: seats }).eq("id", order.id); // 列がなければ無視される
  if (error || !order) {
    return NextResponse.json({ error: `申込を記録できませんでした: ${error?.message ?? ""}` }, { status: 500 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  try {
    const session = await createCheckoutSession({
      orderId: order.id,
      email,
      lines: price.lines,
      successUrl: `${origin}/jimu?plan=added`,
      cancelUrl: `${origin}/jimu`,
      invoiceDescription: `${fiscalYear}年度 ストレスチェック 受検人数の追加(${company?.name ?? ""})`,
      invoiceFooter: invoiceFields(company?.name ?? "", price.total).footer,
      invoiceCustomFields: invoiceFields(company?.name ?? "", price.total).customFields,
    });
    await admin.from("plan_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    await admin.from("plan_orders").update({ status: "failed", error: String(e) }).eq("id", order.id);
    return NextResponse.json({ error: "決済画面を開けませんでした。時間をおいてもう一度お試しください。" }, { status: 502 });
  }
}
