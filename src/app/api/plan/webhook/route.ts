import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe";
import { maxEndOf, seatsGranted } from "@/lib/plan";
import { adminClient, officeEmails, orderSummary, OrderRow, sendMails } from "@/lib/plan-server";
import { IMPLEMENTER, SELLER } from "@/lib/org";

export const runtime = "nodejs";
export const maxDuration = 60;

// Stripe からの支払い通知(Webhook)。署名を確かめてから、企業・受検期間・配布URLを開設し、
// 担当者(実施事務従事者)へ招待メールを送る。
// Stripe は同じ通知を再送することがあるため、開設処理は二重に行わない(DB関数 provision_plan_order)
export async function POST(req: Request) {
  const payload = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });

  const event = JSON.parse(payload) as {
    type: string;
    data: {
      object: { id: string; payment_status?: string; payment_intent?: string | null; invoice?: string | null; metadata?: Record<string, string> };
    };
  };
  const session = event.data.object;
  const orderId = session.metadata?.order_id;
  if (!orderId) return NextResponse.json({ ignored: true });

  if (event.type === "checkout.session.expired") {
    await admin.from("plan_orders").update({ status: "expired" }).eq("id", orderId).eq("status", "pending");
    return NextResponse.json({ ok: true });
  }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ ignored: true });
  }
  if (session.payment_status !== "paid") return NextResponse.json({ waiting: true });

  const { data: order } = await admin.from("plan_orders").select("*").eq("id", orderId).single<OrderRow>();
  if (!order) return NextResponse.json({ error: "order not found" }, { status: 404 });

  const granted = order.kind === "new" ? seatsGranted(order.seats) : order.seats;
  const maxEnd = order.exam_start ? maxEndOf(order.exam_start) : order.exam_end ?? "2000-01-01";
  const { data: rows, error } = await admin.rpc("provision_plan_order", {
    p_order: order.id,
    p_payment_intent: session.payment_intent ?? null,
    p_seats_granted: granted,
    p_max_end: maxEnd,
  });
  const office = await officeEmails(admin);
  if (error || !rows?.[0]) {
    const msg = error?.message ?? "開設処理の結果がありません";
    await admin.from("plan_orders").update({ status: "failed", error: msg }).eq("id", order.id);
    await sendMails(office, "【ストレスチェックWeb】Web申込の開設に失敗しました(要確認)", `${orderSummary(order, granted)}\n\nエラー: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 }); // Stripe に再送してもらう
  }
  const { company_id: companyId, already } = rows[0] as { company_id: string; company_code: string; already: boolean };
  // 領収書を後から取り出せるよう、請求書IDを記録する(再送の場合も上書きして構わない)
  if (session.invoice) await admin.from("plan_orders").update({ stripe_invoice_id: session.invoice }).eq("id", order.id);
  if (already) return NextResponse.json({ ok: true, already: true });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  let note = "";

  if (order.kind === "new") {
    // 担当者を実施事務従事者として招待する(パスワード設定のメールが届く)
    const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(order.contact_email, {
      redirectTo: `${origin}/auth/callback?next=/account/update-password`,
      data: { full_name: order.contact_name },
    });
    if (invErr || !invited?.user) {
      note = /already|registered|exists/i.test(invErr?.message ?? "")
        ? "担当者のメールアドレスは既に登録済みのため、招待メールを送れませんでした。実施者の「ユーザー管理」で所属・ロールを確認してください。"
        : `担当者の招待に失敗しました: ${invErr?.message ?? "不明なエラー"}`;
    } else {
      const { error: profErr } = await admin.from("profiles").upsert({
        user_id: invited.user.id,
        role: "jimu",
        name: order.contact_name,
        emp_id: null,
        dept: null,
        company_id: companyId,
      });
      if (profErr) note = `担当者のプロフィール登録に失敗しました: ${profErr.message}`;
    }
    if (note) await admin.from("plan_orders").update({ error: note }).eq("id", order.id);

    await sendMails(
      [order.contact_email],
      "【ストレスチェックWeb】お申込みありがとうございます(受検の準備のご案内)",
      [
        `${order.company_name}`,
        `${order.contact_name} 様`,
        "",
        "ストレスチェックWebにお申込みいただき、ありがとうございます。お支払いを確認し、受検の準備が整いました。",
        "",
        orderSummary(order, granted),
        "",
        "■ このあとの流れ",
        "1. 別のメール「招待」から、ログイン用のパスワードを設定してください。",
        `   (届かない場合は ${origin}/login の「パスワードを忘れた方」から設定できます)`,
        "2. ログイン後、実施事務従事者としての誓約(人事権を持たないことの確認)を行ってください。",
        "3. 「配布URL・QR」から受検用のURL・QRコードを従業員の皆さまにお知らせください。",
        "   受検期間の前に、実施の目的・期間・結果の取扱いを従業員の皆さまへ周知してください。",
        "4. 締切後に「集団分析」で集団分析報告書をご覧いただけます。",
        "",
        "■ 領収書",
        "決済代行会社(Stripe)から領収書のメールが届きます。ログイン後の画面の「お支払いの記録」からも、いつでもダウンロードできます。",
        "",
        `実施者: ${IMPLEMENTER.full}(${IMPLEMENTER.officeName})`,
        `お問い合わせ: ${SELLER.email}`,
      ].join("\n")
    );
  } else {
    await sendMails(
      [order.contact_email],
      "【ストレスチェックWeb】受検人数を追加しました",
      [`${order.company_name}`, `${order.contact_name} 様`, "", "受検人数の追加を承りました。", "", orderSummary(order, granted), "", `お問い合わせ: ${SELLER.email}`].join("\n")
    );
  }

  await sendMails(
    office,
    order.kind === "new" ? "【ストレスチェックWeb】Web申込がありました" : "【ストレスチェックWeb】受検人数の追加購入がありました",
    `${orderSummary(order, granted)}${note ? `\n\n要確認: ${note}` : ""}\n\n${origin}/office`
  );

  return NextResponse.json({ ok: true });
}
