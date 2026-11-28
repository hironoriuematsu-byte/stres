import Stripe from "stripe";

// ============================================================
// Stripe(クレジットカード等の決済)。公式SDKのクライアントを1つ作って使う。
// カード番号は Stripe の決済画面(Checkout)で入力され、このシステムのサーバーには届かない。
//
// 環境変数(Vercel。値は「Sensitive」にして画面やログに出ないようにする):
//   STRIPE_SECRET_KEY      … 制限付きAPIキー(rk_test_… / rk_live_…)を推奨。必要な権限は
//                            Checkout Sessions: 書き込み / Invoices: 読み取り(シークレットキー sk_ でも動く)。
//                            銀行振込を使うときは、加えて Customers: 書き込み / PaymentIntents: 書き込み
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

export type CheckoutOptions = {
  orderId: string;
  email: string;
  lines: CheckoutLine[];
  successUrl: string;
  cancelUrl: string;
  invoiceFooter: string; // 領収書(請求書PDF)の下部に載せる文言(発行者・登録番号)
  invoiceCustomFields?: { name: string; value: string }[]; // 上部の項目(宛名・登録番号・適用税率。4つまで)
  invoiceDescription: string;
  // 銀行振込も選べるようにするときの、会社の Stripe 顧客ID。
  // 銀行振込は、振込先の口座を顧客ごとに発行して入金を照合するため、決済画面を作る前に顧客が要る
  customerId?: string | null;
};
type CheckoutParams = Stripe.Checkout.SessionCreateParams & { integration_identifier?: string };

// 決済画面(Checkout Session)の内容を組み立てる
//   - カードのみ: 支払い方法は指定しない(ダッシュボードで有効にした方法が自動で表示される)
//   - 銀行振込も選べる(customerId あり): カードと銀行振込を指定する。銀行振込は後から入金されるので、
//     入金が確認されたとき(checkout.session.async_payment_succeeded)に開設する
//   - 金額は税込(tax_behavior: inclusive)。STRIPE_AUTOMATIC_TAX=1 のときは Stripe Tax が消費税額を計算する
export function checkoutParams(opts: CheckoutOptions, automaticTax: boolean): CheckoutParams {
  const bank = Boolean(opts.customerId);
  return {
    mode: "payment",
    locale: "ja",
    ...(bank
      ? {
          customer: opts.customerId!,
          payment_method_types: ["card", "customer_balance"],
          payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "jp_bank_transfer" } } },
          // 登録済みの顧客で消費税を計算するときは、決済画面で入力された住所を顧客に保存する必要がある
          ...(automaticTax ? { customer_update: { address: "auto" as const } } : {}),
        }
      : {
          customer_email: opts.email,
          // 顧客(Customer)を作る(領収書の宛先として残る)
          customer_creation: "always" as const,
        }),
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
}

type SessionMaker = { checkout: { sessions: { create: (p: CheckoutParams, o: { idempotencyKey: string }) => Promise<{ id: string; url: string | null }> } } };

// 決済画面を作る。支払い完了は Webhook で受け取る。
// 銀行振込つきで作れなかったとき(Stripe 側で銀行振込がまだ有効でない など)は、今までどおりカードのみで作り直し、
// bankError に理由を返す(お申込みそのものは止めない)
export async function createCheckoutSession(
  opts: CheckoutOptions,
  stripe: SessionMaker = stripeClient() as unknown as SessionMaker
): Promise<{ id: string; url: string; bank: boolean; bankError?: string }> {
  const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "1";
  const make = async (o: CheckoutOptions, key: string) => {
    const session = await stripe.checkout.sessions.create(checkoutParams(o, automaticTax), { idempotencyKey: key });
    if (!session.url) throw new Error("Stripe: 決済画面のURLがありません");
    return { id: session.id, url: session.url };
  };
  if (!opts.customerId) return { ...(await make(opts, `checkout-${opts.orderId}`)), bank: false };
  try {
    return { ...(await make(opts, `checkout-${opts.orderId}-bank`)), bank: true };
  } catch (e) {
    const bankError = e instanceof Error ? e.message : String(e);
    console.error("stripe: checkout with bank transfer failed, falling back to card only", bankError);
    return { ...(await make({ ...opts, customerId: null }, `checkout-${opts.orderId}`)), bank: false, bankError };
  }
}

// 会社の Stripe 顧客を用意する(あれば名前と宛先のメールを最新にし、なければ作る)。
// 振込先の口座は顧客ごとに決まるので、同じ会社は同じ顧客を使い続ける
type CustomerApi = {
  customers: {
    create: (p: Stripe.CustomerCreateParams) => Promise<{ id: string }>;
    update: (id: string, p: Stripe.CustomerUpdateParams) => Promise<{ id: string; deleted?: boolean }>;
  };
};
export async function ensureCustomer(
  c: { existingId: string | null; companyId: string; name: string; email: string },
  stripe: CustomerApi = stripeClient() as unknown as CustomerApi
): Promise<string> {
  const fields = { name: c.name.slice(0, 250), email: c.email, preferred_locales: ["ja"], metadata: { company_id: c.companyId } };
  if (c.existingId) {
    try {
      const u = await stripe.customers.update(c.existingId, fields);
      if (!u.deleted) return u.id;
    } catch (e) {
      // Stripe 側で消されていた顧客など: 作り直す
      console.error("stripe: customer update failed, creating a new one", e instanceof Error ? e.message : e);
    }
  }
  return (await stripe.customers.create(fields)).id;
}

// 決済(PaymentIntent)の、いまの状態と銀行振込の案内
export async function paymentState(paymentIntentId: string): Promise<{ status: string; amount: number; nextAction: unknown }> {
  const pi = await stripeClient().paymentIntents.retrieve(paymentIntentId);
  return { status: pi.status, amount: pi.amount, nextAction: pi.next_action };
}

// 入金待ちの決済を取り消す(このあと振り込まれたお金は、決済には充てられず、顧客の残高に残る)
export async function cancelPayment(paymentIntentId: string): Promise<void> {
  await stripeClient().paymentIntents.cancel(paymentIntentId);
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
