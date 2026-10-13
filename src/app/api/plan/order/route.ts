import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fiscalYearOf, parseOrderInput, priceNew, seatsGranted } from "@/lib/plan";
import { loadPricing } from "@/lib/plan-prices";
import { adminClient, invoiceFields } from "@/lib/plan-server";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

// 年度の申込(ログイン後の画面から。初年度も2年目以降も同じ操作)。
// 登録済みの企業に対して申込を記録し、Stripe の決済画面のURLを返す。金額は必ずサーバー側で計算する
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "現在、オンラインでのお申込みは準備中です。実施者にご連絡ください。" }, { status: 503 });
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
    return NextResponse.json({ error: "お申込みは、自社の実施事務従事者のみ行えます" }, { status: 403 });
  }
  const { data: company } = await admin
    .from("companies")
    .select("name, questionnaire, web_signup, office_name, address, contact_phone")
    .eq("id", me.company_id)
    .single();
  if (!company?.web_signup) {
    return NextResponse.json({ error: "この企業はWeb申込の対象ではありません(産業医契約のある企業さまはお申込み不要です)" }, { status: 400 });
  }

  let raw: Record<string, unknown> = {};
  try {
    raw = await req.json();
  } catch {
    /* fallthrough */
  }
  const parsed = parseOrderInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;
  const fiscalYear = fiscalYearOf(v.examStart);

  const [{ data: existing }, { data: prior }] = await Promise.all([
    admin.from("exam_plans").select("fiscal_year").eq("company_id", me.company_id).eq("fiscal_year", fiscalYear).maybeSingle(),
    admin.from("exam_plans").select("fiscal_year").eq("company_id", me.company_id).limit(1),
  ]);
  if (existing) {
    return NextResponse.json(
      { error: `${fiscalYear}年度はすでにお申込み済みです。人数の追加・締切の変更は${fiscalYear}年度の画面から行えます` },
      { status: 400 }
    );
  }

  const email = user.email ?? "";
  // 料金は受検開始日の年度のもの(申込時点の単価・受検人数枠を記録し、後の改定の影響を受けない)
  const pricing = await loadPricing(admin, fiscalYear);
  const price = priceNew(v.seats, pricing);
  const row = {
    kind: prior && prior.length > 0 ? "renew" : "new",
      company_id: me.company_id,
      fiscal_year: fiscalYear,
      seats: v.seats,
      amount: price.total,
      company_name: company.name,
      office_name: company.office_name,
      address: company.address,
      contact_name: me.name,
      contact_email: email,
      contact_phone: company.contact_phone,
      workers: v.workers,
      questionnaire: v.questionnaire,
      exam_start: v.examStart,
      exam_end: v.examEnd,
      interview_option: v.interviewOption,
  };
  let { data: order, error } = await admin
    .from("plan_orders")
    .insert({ ...row, unit_price: pricing.unitPrice, seats_granted: seatsGranted(v.seats, pricing) })
    .select("id")
    .single();
  if (error && /unit_price|seats_granted/.test(error.message)) {
    // 料金設定の列がまだない(SQL 0026 の実行前)
    ({ data: order, error } = await admin.from("plan_orders").insert(row).select("id").single());
  }
  if (error || !order) return NextResponse.json({ error: `申込を記録できませんでした: ${error?.message ?? ""}` }, { status: 500 });
  // 労働者数は次回の初期値に使う
  await admin.from("companies").update({ workers: v.workers }).eq("id", me.company_id);

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const inv = invoiceFields(company.name, price.total);
  try {
    const session = await createCheckoutSession({
      orderId: order.id,
      email,
      lines: price.lines,
      successUrl: `${origin}/jimu?plan=ordered`,
      cancelUrl: `${origin}/jimu`,
      invoiceDescription: `${fiscalYear}年度 ストレスチェック(${company.name})`,
      invoiceFooter: inv.footer,
      invoiceCustomFields: inv.customFields,
    });
    await admin.from("plan_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    await admin.from("plan_orders").update({ status: "failed", error: String(e) }).eq("id", order.id);
    return NextResponse.json({ error: "決済画面を開けませんでした。時間をおいてもう一度お試しください。" }, { status: 502 });
  }
}
