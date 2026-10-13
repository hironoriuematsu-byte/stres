import Stripe from "stripe";

// ============================================================
// Stripe(クレジットカード等の決済)。公式SDKのクライアントを1つ作って使う。
// カード番号は Stripe の決済画面(Checkout)で入力され、このシステムのサーバーには届かない。
//
// 環境変数(Vercel。値は「Sensitive」にして画面やログに出ないようにする):
//   STRIPE_SECRET_KEY      … 制限付きAPIキー(rk_test_… / rk_live_…)を推奨。必要な権限は
//                            Checkout Sessions: 書き込み / Invoices: 読み取り のみ(シークレットキー sk_ でも動く)
//   STRIPE_WEBHOOK_SECRET  … Webhook の署名シークレット(whsec_…)
//   STRIPE_AUTOMATIC_TAX   … "1" のときだけ Stripe Tax で消費税を計算する(日本の登録を Stripe に追加してから)
//   INVOICE_REGISTRATION_NO … (任意)登録番号を変えるときだけ。通常は lib/org.ts の SELLER の値を使う
// どちらかのキーが無い間は、申込ページは「準備中」と表示して決済を受け付けない。
// ============================================================

// API のバージョンはSDKに合わせて固定する(Stripe側の既定の変更で動きが変わらないように)
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;
// ダッシュボードでこの申込の流れの決済を見分けるための印(末尾は任意の8文字)
const INTEGRATION_ID = "stres-web-plan-kqzvmbtr";

export const stripeConfigured = (): boolean =>
  Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

let client: Stripe | null = null;
export function stripeClient(): Stripe {
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 2,
      appInfo: { name: "stres-web-plan" },
    });
  }
  return client;
}

export type CheckoutLine = { name: string; unitAmount: number; quantity: number };

// 決済画面(Checkout Session)を作る。支払い完了は Webhook で受け取る
//   - 支払い方法は指定しない(ダッシュボードで有効にした方法が自動で表示される)。コンビニ・銀行振込など
//     後から入金される方法は checkout.session.async_payment_succeeded で開設する
//   - 金額は税込(tax_behavior: inclusive)。STRIPE_AUTOMATIC_TAX=1 のときは Stripe Tax が消費税額を計算する
export async function createCheckoutSession(opts: {
  orderId: string;
  email: string;
  lines: CheckoutLine[];
  successUrl: string;
  cancelUrl: string;
  invoiceFooter: string; // 領収書(請求書PDF)の下部に載せる文言(発行者・登録番号)
  invoiceCustomFields?: { name: string; value: string }[]; // 上部の項目(宛名・登録番号・適用税率。4つまで)
  invoiceDescription: string;
}): Promise<{ id: string; url: string }> {
  const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "1";
  const params: Stripe.Checkout.SessionCreateParams & { integration_identifier?: string } = {
    mode: "payment",
    locale: "ja",
    customer_email: opts.email,
    // 顧客(Customer)を作る。銀行振込(振込先口座を会社ごとに発行し、入金を自動で照合)を使うときに必要
    customer_creation: "always",
    client_reference_id: opts.orderId,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    line_items: opts.lines.map((l) => ({
      quantity: l.quantity,
      price_data: { currency: "jpy", unit_amount: l.unitAmount, tax_behavior: "inclusive", product_data: { name: l.name } },
    })),
    automatic_tax: automaticTax ? { enabled: true } : undefined,
    metadata: { order_id: opts.orderId },
    payment_intent_data: { metadata: { order_id: opts.orderId } },
    // 支払い後に領収書(請求書PDF)をメールで送る
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: opts.invoiceDescription,
        footer: opts.invoiceFooter,
        custom_fields: opts.invoiceCustomFields?.slice(0, 4),
        metadata: { order_id: opts.orderId },
      },
    },
    integration_identifier: INTEGRATION_ID,
  };
  const session = await stripeClient().checkout.sessions.create(params, { idempotencyKey: `checkout-${opts.orderId}` });
  if (!session.url) throw new Error("Stripe: 決済画面のURLがありません");
  return { id: session.id, url: session.url };
}

// 領収書のページ(請求書・領収書のPDFをダウンロードできる Stripe のページ)のURLを、その都度取り出す。
// 請求書IDが未記録の申込は、決済画面(Checkout Session)から請求書をたどる
export async function receiptPageUrl(opts: { invoiceId?: string | null; sessionId?: string | null }): Promise<string | null> {
  const stripe = stripeClient();
  let invoiceId = opts.invoiceId ?? null;
  if (!invoiceId && opts.sessionId) {
    const s = await stripe.checkout.sessions.retrieve(opts.sessionId);
    invoiceId = typeof s.invoice === "string" ? s.invoice : (s.invoice?.id ?? null);
  }
  if (!invoiceId) return null;
  const inv = await stripe.invoices.retrieve(invoiceId);
  return inv.hosted_invoice_url ?? null;
}

// Webhook の署名(Stripe-Signature)を確かめて、イベントを取り出す。
// 他人が「支払い済み」を装って開設させることを防ぐ。署名が合わなければ null
export function constructWebhookEvent(payload: string, header: string | null, secret: string): Stripe.Event | null {
  if (!header || !secret) return null;
  try {
    return Stripe.webhooks.constructEvent(payload, header, secret);
  } catch {
    return null;
  }
}
