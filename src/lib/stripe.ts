import { createHmac, timingSafeEqual } from "crypto";

// ============================================================
// Stripe(クレジットカード決済)。SDKは使わず REST API を直接呼ぶ(依存を増やさない)。
// カード番号は Stripe の決済画面(Checkout)で入力され、このシステムのサーバーには届かない。
//
// 環境変数(Vercel):
//   STRIPE_SECRET_KEY      … シークレットキー(sk_test_… / sk_live_…)
//   STRIPE_WEBHOOK_SECRET  … Webhook の署名シークレット(whsec_…)
//   INVOICE_REGISTRATION_NO … 適格請求書発行事業者の登録番号(T+13桁。未登録なら空)
// どちらかのキーが無い間は、申込ページは「準備中」と表示して決済を受け付けない。
// ============================================================

export const stripeConfigured = (): boolean =>
  Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

// Stripe の form-encoded 形式(a[b][0][c]=…)に変換する
export function encodeForm(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") out.push(...encodeForm(item as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      out.push(...encodeForm(v as Record<string, unknown>, key));
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

async function stripeGet<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`);
  return json;
}

// 領収書のページ(請求書・領収書のPDFをダウンロードできる Stripe のページ)のURLを、その都度取り出す。
// 請求書IDが未記録の古い申込は、決済画面(Checkout Session)から請求書をたどる
export async function receiptPageUrl(opts: { invoiceId?: string | null; sessionId?: string | null }): Promise<string | null> {
  let invoiceId = opts.invoiceId ?? null;
  if (!invoiceId && opts.sessionId) {
    const s = await stripeGet<{ invoice: string | null }>(`checkout/sessions/${encodeURIComponent(opts.sessionId)}`);
    invoiceId = s.invoice;
  }
  if (!invoiceId) return null;
  const inv = await stripeGet<{ hosted_invoice_url: string | null }>(`invoices/${encodeURIComponent(invoiceId)}`);
  return inv.hosted_invoice_url;
}

async function stripePost<T>(path: string, params: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: encodeForm(params).join("&"),
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`);
  return json;
}

export type CheckoutLine = { name: string; unitAmount: number; quantity: number };

// 決済画面(Checkout Session)を作る。支払い完了は Webhook(checkout.session.completed)で受け取る
export async function createCheckoutSession(opts: {
  orderId: string;
  email: string;
  lines: CheckoutLine[];
  successUrl: string;
  cancelUrl: string;
  invoiceFooter: string; // 領収書(請求書PDF)の下部に載せる文言(登録番号・消費税額など)
  invoiceDescription: string;
}): Promise<{ id: string; url: string }> {
  return stripePost<{ id: string; url: string }>(
    "checkout/sessions",
    {
      mode: "payment",
      locale: "ja",
      payment_method_types: ["card"],
      customer_email: opts.email,
      client_reference_id: opts.orderId,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      line_items: opts.lines.map((l) => ({
        quantity: l.quantity,
        price_data: { currency: "jpy", unit_amount: l.unitAmount, product_data: { name: l.name } },
      })),
      metadata: { order_id: opts.orderId },
      payment_intent_data: { metadata: { order_id: opts.orderId } },
      // 支払い後に領収書(請求書PDF)をメールで送る
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: opts.invoiceDescription,
          footer: opts.invoiceFooter,
          metadata: { order_id: opts.orderId },
        },
      },
    },
    `checkout-${opts.orderId}`
  );
}

// Webhook の署名(Stripe-Signature: t=…,v1=…)を確かめる。
// 他人が「支払い済み」を装って企業を開設させることを防ぐ
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSec = 300,
  nowSec: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0 || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`, "utf8").digest("hex");
  const e = Buffer.from(expected, "hex");
  return sigs.some((s) => {
    const b = Buffer.from(s, "hex");
    return b.length === e.length && timingSafeEqual(b, e);
  });
}
