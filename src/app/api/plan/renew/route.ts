import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkEmailDomain } from "@/lib/email-domain-check";
import { fiscalYearOf, InterviewOption, periodError, priceNew, WEB_MAX_SEATS } from "@/lib/plan";
import { adminClient, invoiceFields } from "@/lib/plan-server";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

// 継続申込(次年度以降): Web申込の企業の実施事務従事者が、自社の画面から新しい年度を申し込む。
// 同じ企業に新しい年度の受検期間・人数枠・配布URLを追加するので、担当者・従業員のアカウントや
// 過去の結果(集団分析の経年比較・5年保存)はそのまま引き継がれる
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
    return NextResponse.json({ error: "継続のお申込みは、自社の実施事務従事者のみ行えます" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* fallthrough */
  }
  const seats = Number(String(body.seats ?? "").normalize("NFKC"));
  const workers = Number(String(body.workers ?? "").normalize("NFKC"));
  const examStart = String(body.examStart ?? "");
  const examEnd = String(body.examEnd ?? "");
  const interviewOption = (["own", "mestate", "sanpo"] as const).find((o) => o === body.interviewOption) as InterviewOption | undefined;

  if (!Number.isInteger(workers) || workers < 1) return NextResponse.json({ error: "事業場の労働者数を入力してください" }, { status: 400 });
  if (!Number.isInteger(seats) || seats < 1) return NextResponse.json({ error: "受検予定人数を入力してください" }, { status: 400 });
  if (seats > workers) {
    return NextResponse.json({ error: `受検予定人数(${seats}名)が事業場の労働者数(${workers}名)を超えています。人数をご確認ください` }, { status: 400 });
  }
  if (seats > WEB_MAX_SEATS) {
    return NextResponse.json({ error: `${WEB_MAX_SEATS}名を超える場合は個別にお見積りします(割引があります)。support@mestate.jp までお問い合わせください` }, { status: 400 });
  }
  const pe = periodError(examStart, examEnd);
  if (pe) return NextResponse.json({ error: pe }, { status: 400 });
  if (!interviewOption) return NextResponse.json({ error: "産業医面接指導の担当を選んでください" }, { status: 400 });
  if (interviewOption === "sanpo" && workers >= 50) {
    return NextResponse.json({ error: "地域産業保健センターは50人未満の事業場が対象です" }, { status: 400 });
  }
  if (body.agreeTerms !== true || body.agreeProcedure !== true) {
    return NextResponse.json({ error: "利用規約への同意と、実施方法の決定・周知の確認が必要です" }, { status: 400 });
  }

  const fiscalYear = fiscalYearOf(examStart);
  const [{ data: existing }, { data: company }, { data: prev }] = await Promise.all([
    admin.from("exam_plans").select("fiscal_year").eq("company_id", me.company_id).eq("fiscal_year", fiscalYear).maybeSingle(),
    admin.from("companies").select("name, questionnaire").eq("id", me.company_id).single(),
    admin
      .from("plan_orders")
      .select("office_name, address, contact_phone")
      .eq("company_id", me.company_id)
      .in("kind", ["new", "renew"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (existing) {
    return NextResponse.json({ error: `${fiscalYear}年度はすでにお申込み済みです。人数の追加・締切の変更は${fiscalYear}年度の画面から行えます` }, { status: 400 });
  }
  if (!prev) return NextResponse.json({ error: "これまでのWeb申込が見つかりません" }, { status: 404 });

  const email = user.email ?? "";
  const domain = await checkEmailDomain(email);
  if (!domain.ok) return NextResponse.json({ error: domain.message }, { status: 400 });

  const price = priceNew(seats);
  const { data: order, error } = await admin
    .from("plan_orders")
    .insert({
      kind: "renew",
      company_id: me.company_id,
      fiscal_year: fiscalYear,
      seats,
      amount: price.total,
      company_name: company?.name ?? "",
      office_name: prev.office_name,
      address: prev.address,
      contact_name: me.name,
      contact_email: email,
      contact_phone: prev.contact_phone,
      workers,
      questionnaire: company?.questionnaire === "80" ? "80" : "57",
      exam_start: examStart,
      exam_end: examEnd,
      interview_option: interviewOption,
    })
    .select("id")
    .single();
  if (error || !order) return NextResponse.json({ error: `申込を記録できませんでした: ${error?.message ?? ""}` }, { status: 500 });

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const inv = invoiceFields(company?.name ?? "", price.total);
  try {
    const session = await createCheckoutSession({
      orderId: order.id,
      email,
      lines: price.lines,
      successUrl: `${origin}/jimu?plan=renewed`,
      cancelUrl: `${origin}/jimu`,
      invoiceDescription: `${fiscalYear}年度 ストレスチェック(${company?.name ?? ""})`,
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
