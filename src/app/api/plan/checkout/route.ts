import { NextResponse } from "next/server";
import { checkEmailDomain } from "@/lib/email-domain-check";
import { fiscalYearOf, parseApplyInput, priceNew } from "@/lib/plan";
import { adminClient, invoiceFields } from "@/lib/plan-server";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

// Web申込: 入力を確かめて申込を記録し、Stripe の決済画面のURLを返す。
// 金額は必ずサーバー側で計算する(画面から送られた金額は使わない)
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "現在、Web申込は準備中です。お手数ですがメールでお問い合わせください。" }, { status: 503 });
  }
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = parseApplyInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;

  // 存在しないドメイン(入力ミス)では担当者への招待メールが届かないため、ここで止める
  const domain = await checkEmailDomain(v.contactEmail);
  if (!domain.ok) return NextResponse.json({ error: domain.message }, { status: 400 });

  const price = priceNew(v.seats);
  const fiscalYear = fiscalYearOf(v.examStart);

  const { data: order, error } = await admin
    .from("plan_orders")
    .insert({
      kind: "new",
      fiscal_year: fiscalYear,
      seats: v.seats,
      amount: price.total,
      company_name: v.companyName,
      office_name: v.officeName || null,
      address: v.address,
      contact_name: v.contactName,
      contact_email: v.contactEmail,
      contact_phone: v.contactPhone,
      workers: v.workers,
      questionnaire: v.questionnaire,
      exam_start: v.examStart,
      exam_end: v.examEnd,
      interview_option: v.interviewOption,
    })
    .select("id")
    .single();
  if (error || !order) {
    return NextResponse.json({ error: `申込を記録できませんでした: ${error?.message ?? ""}` }, { status: 500 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  try {
    const session = await createCheckoutSession({
      orderId: order.id,
      email: v.contactEmail,
      lines: price.lines,
      successUrl: `${origin}/plan/thanks?order=${order.id}`,
      cancelUrl: `${origin}/plan/apply?canceled=1`,
      invoiceDescription: `${fiscalYear}年度 ストレスチェック(${v.companyName})`,
      invoiceFooter: invoiceFields(v.companyName, price.total).footer,
      invoiceCustomFields: invoiceFields(v.companyName, price.total).customFields,
    });
    await admin.from("plan_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return NextResponse.json({ url: session.url });
  } catch (e) {
    await admin.from("plan_orders").update({ status: "failed", error: String(e) }).eq("id", order.id);
    return NextResponse.json({ error: "決済画面を開けませんでした。時間をおいてもう一度お試しください。" }, { status: 502 });
  }
}
