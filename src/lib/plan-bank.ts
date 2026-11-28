import type { SupabaseClient } from "@supabase/supabase-js";
import { shortBy, transferDue, transferGuide, transferInstructions, transferPhase, type PayInfo } from "@/lib/bank-transfer";
import { bankTransferOn, jstToday } from "@/lib/plan";
import { officeEmails, orderSummary, sendMails, type OrderRow } from "@/lib/plan-server";
import { SELLER } from "@/lib/org";
import { cancelPayment, ensureCustomer, paymentState } from "@/lib/stripe";

// ============================================================
// Web申込の銀行振込(サーバー側の流れ)。
//   申込 → 決済画面で「銀行振込」を選ぶ → お振込み待ち(振込先と期限をメールと画面で案内)
//   → 入金が確認されると、カードのときと同じように開設される(Webhook の async_payment_succeeded)
//   → 期限までに入金がなければ、毎日の見回りで取り消す
// Stripe やメールを呼ぶ部分は、テストで差し替えられるように引数で受け取る
// ============================================================

export type BankOrder = OrderRow & {
  stripe_payment_intent: string | null;
  pay_method: string | null;
  pay_due: string | null;
  pay_url: string | null;
  pay_info: PayInfo | null;
  pay_reminded_at: string | null;
  pay_short_at: string | null;
};

export type BankDeps = {
  paymentState: typeof paymentState;
  cancelPayment: typeof cancelPayment;
  sendMails: typeof sendMails;
  officeEmails: typeof officeEmails;
  today: () => string;
};
const defaults: BankDeps = { paymentState, cancelPayment, sendMails, officeEmails, today: () => jstToday() };

const head = (o: OrderRow) => [o.company_name, `${o.contact_name} 様`, ""];
const foot = (origin: string) => ["", `ログイン: ${origin}/login?next=/jimu`, `お問い合わせ: ${SELLER.email}`];
const title = (o: OrderRow) => (o.kind === "add_seats" ? "受検人数の追加" : `${o.fiscal_year}年度のお申込み`);

// 会社の Stripe 顧客ID(銀行振込を受け付けるときだけ用意する)。
// 用意できなかったときは id: null(決済画面はカードのみになる)と、その理由を返す
export async function customerForCompany(
  admin: SupabaseClient,
  c: { companyId: string; name: string; email: string },
  ensure: typeof ensureCustomer = ensureCustomer
): Promise<{ id: string | null; error?: string }> {
  if (!bankTransferOn()) return { id: null };
  const { data, error } = await admin.from("companies").select("stripe_customer_id").eq("id", c.companyId).maybeSingle();
  if (error) return { id: null, error: `会社の顧客IDの欄がありません(SQL 0036 が未実行の可能性があります): ${error.message}` };
  const existing = (data as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  try {
    const id = await ensure({ existingId: existing, companyId: c.companyId, name: c.name, email: c.email });
    if (id !== existing) await admin.from("companies").update({ stripe_customer_id: id }).eq("id", c.companyId);
    return { id };
  } catch (e) {
    return { id: null, error: `Stripe の顧客を用意できませんでした(APIキーの権限「Customers: 書き込み」をご確認ください): ${e instanceof Error ? e.message : String(e)}` };
  }
}

// 銀行振込を表示できず、カードのみで受け付けたことを、実施者に知らせる
export async function reportBankFallback(admin: SupabaseClient, companyName: string, reasons: (string | undefined)[], deps: Pick<BankDeps, "sendMails" | "officeEmails"> = defaults) {
  const list = reasons.filter((r): r is string => Boolean(r));
  if (list.length === 0) return;
  await deps.sendMails(
    await deps.officeEmails(admin),
    "【ストレスチェックWeb】銀行振込を表示できませんでした(カードのみで受け付けました)",
    [`会社名: ${companyName}`, "", "決済画面に銀行振込を出せなかったため、クレジットカードのみでお申込みを受け付けました。", "", ...list.map((r) => `理由: ${r}`), "", "Stripe の管理画面で銀行振込が有効か、APIキーの権限(Customers・PaymentIntents の書き込み)、SQL 0036 の実行をご確認ください。"].join("\n")
  );
}

// 決済画面で銀行振込が選ばれた(まだ入金されていない)。お振込み待ちとして控え、振込先と期限を案内する。
// Stripe は同じ通知を送り直すことがあるので、最初の1回だけ案内する
export async function noteAwaitingTransfer(admin: SupabaseClient, orderId: string, paymentIntentId: string | null, origin: string, deps: BankDeps = defaults): Promise<boolean> {
  const { data: claimed, error } = await admin
    .from("plan_orders")
    .update({ pay_method: "bank_transfer", pay_due: transferDue(deps.today()), ...(paymentIntentId ? { stripe_payment_intent: paymentIntentId } : {}) })
    .eq("id", orderId)
    .eq("status", "pending")
    .is("pay_method", null)
    .select("*")
    .maybeSingle<BankOrder>();
  if (error) {
    console.error("bank transfer: could not record the awaiting order (SQL 0036?)", error.message);
    return false;
  }
  if (!claimed) return false;
  let order = claimed;
  let unread = !paymentIntentId; // 振込先を取り出せなかった
  // 振込先を Stripe から取り出して控える(取り出せなくても、案内は送る)
  if (paymentIntentId) {
    try {
      const ins = transferInstructions((await deps.paymentState(paymentIntentId)).nextAction);
      if (ins) {
        await admin.from("plan_orders").update({ pay_url: ins.url, pay_info: ins.info }).eq("id", orderId);
        order = { ...order, pay_url: ins.url, pay_info: ins.info };
      } else unread = true;
    } catch (e) {
      unread = true;
      console.error("bank transfer: could not read the instructions", e instanceof Error ? e.message : e);
    }
  }
  await deps.sendMails(
    [order.contact_email],
    `【ストレスチェックWeb】お振込みのご案内(${title(order)})`,
    [
      ...head(order),
      `${title(order)}を受け付けました。下記の口座へお振込みください。ご入金の確認後に、${order.kind === "add_seats" ? "人数枠に反映します" : "受検の準備が整います"}。`,
      "",
      orderSummary(order, order.seats_granted ?? order.seats),
      "",
      ...transferGuide(order),
      "",
      "■ 請求書",
      "経理のご担当者さまにお渡しいただける請求書(振込先入り)を、ログイン後の画面の「お振込み待ちのお申込み」から印刷・PDF保存できます。",
      `${origin}/plan/invoice/${order.id}`,
      "",
      "期限までにご入金が確認できない場合、このお申込みは自動で取り消されます(ご請求はありません)。",
      "お申込みを取り消す場合や、クレジットカードでのお支払いに変える場合は、同じ画面から取り消してください。",
      ...foot(origin),
    ].join("\n")
  );
  await deps.sendMails(
    await deps.officeEmails(admin),
    "【ストレスチェックWeb】銀行振込のお申込みがありました(お振込み待ち)",
    `${orderSummary(order, order.seats_granted ?? order.seats)}\nお振込みの期限: ${order.pay_due}\n\n入金が確認されると自動で開設され、あらためてお知らせします。\n${origin}/office` +
      (unread ? "\n\n※ 振込先を Stripe から取り出せなかったため、担当者へのご案内・請求書に振込先を載せられていません。APIキーの権限(PaymentIntents: 書き込み)をご確認ください。振込先は、Stripe の管理画面の該当の決済から確認できます。" : "")
  );
  return true;
}

// お振込み待ちの申込を取り消す(本人の操作・期限切れ)。Stripe 側の決済も取り消す。
// すでに入金がある(全部または一部)ときは取り消さない
export async function cancelTransferOrder(admin: SupabaseClient, order: BankOrder, note: string, deps: BankDeps = defaults): Promise<{ ok: true } | { ok: false; error: string }> {
  if (order.status !== "pending" || order.pay_method !== "bank_transfer") return { ok: false, error: "このお申込みは、取り消せる状態ではありません。" };
  if (order.stripe_payment_intent) {
    try {
      const st = await deps.paymentState(order.stripe_payment_intent);
      if (st.status === "succeeded") return { ok: false, error: "ご入金を確認済みのため、取り消せません。まもなく開設されます。" };
      const remaining = transferInstructions(st.nextAction)?.info.remaining;
      if (shortBy(order.amount, remaining) > 0) {
        return { ok: false, error: `一部のご入金(${(order.amount - (remaining ?? 0)).toLocaleString()}円)を確認しているため、画面からは取り消せません。${SELLER.email} までご連絡ください。` };
      }
      if (st.status !== "canceled") await deps.cancelPayment(order.stripe_payment_intent);
    } catch (e) {
      console.error("bank transfer: cancel failed", e instanceof Error ? e.message : e);
      return { ok: false, error: "決済代行会社(Stripe)での取り消しができませんでした。時間をおいてもう一度お試しください。" };
    }
  }
  const { data } = await admin.from("plan_orders").update({ status: "expired", error: note }).eq("id", order.id).eq("status", "pending").select("id");
  if (!data || data.length === 0) return { ok: false, error: "このお申込みは、すでに処理されています。画面を読み込み直してください。" };
  return { ok: true };
}

// 毎日の見回り: お振込み待ちの申込について、期限が近い方へのお知らせ・金額の不足のお知らせ・期限切れの取り消しを行う
export async function sweepBankTransfers(admin: SupabaseClient, origin: string, deps: BankDeps = defaults): Promise<{ reminded: number; short: number; cancelled: number }> {
  const out = { reminded: 0, short: 0, cancelled: 0 };
  const { data, error } = await admin.from("plan_orders").select("*").eq("status", "pending").eq("pay_method", "bank_transfer").order("created_at").limit(200);
  if (error) return out; // SQL 0036 の実行前
  const today = deps.today();
  for (const o of (data ?? []) as BankOrder[]) {
    let short = shortBy(o.amount, o.pay_info?.remaining);
    if (o.stripe_payment_intent) {
      try {
        const st = await deps.paymentState(o.stripe_payment_intent);
        if (st.status === "succeeded") continue; // 入金済み。開設は Webhook が行う
        if (st.status === "canceled") {
          await admin.from("plan_orders").update({ status: "expired", error: "決済が取り消されました" }).eq("id", o.id).eq("status", "pending");
          continue;
        }
        const ins = transferInstructions(st.nextAction);
        if (ins) {
          short = shortBy(o.amount, ins.info.remaining);
          if (ins.info.remaining !== (o.pay_info?.remaining ?? null) || ins.url !== o.pay_url) {
            await admin.from("plan_orders").update({ pay_url: ins.url, pay_info: ins.info }).eq("id", o.id);
            o.pay_url = ins.url;
            o.pay_info = ins.info;
          }
        }
      } catch (e) {
        console.error("bank transfer: could not check the payment", o.id, e instanceof Error ? e.message : e);
        continue; // 状況が分からないときは、何もしない(取り消さない)
      }
    }
    // 一部だけ入金されている: 残りの金額を知らせる(1回だけ)。期限を過ぎても、自動では取り消さない
    if (short > 0) {
      if (o.pay_short_at) continue;
      const { data: got } = await admin.from("plan_orders").update({ pay_short_at: new Date().toISOString() }).eq("id", o.id).is("pay_short_at", null).select("id");
      if (!got || got.length === 0) continue;
      await deps.sendMails(
        [o.contact_email],
        "【ストレスチェックWeb】ご入金の金額が不足しています",
        [...head(o), `${title(o)}について、ご入金を確認しましたが、金額が ${short.toLocaleString()}円 不足しています(振込手数料が差し引かれた可能性があります)。`, "お手数ですが、不足分を同じ口座へお振込みください。確認でき次第、手続きを進めます。", "", ...transferGuide(o), ...foot(origin)].join("\n")
      );
      await deps.sendMails(await deps.officeEmails(admin), "【ストレスチェックWeb】銀行振込の入金額が不足しています(要確認)", `${orderSummary(o, o.seats_granted ?? o.seats)}\n不足額: ${short.toLocaleString()}円\nお振込みの期限: ${o.pay_due}\n\n担当者に、不足分のお振込みをお願いするメールを送りました。期限を過ぎても自動では取り消しません(入金済みの分があるため)。`);
      out.short++;
      continue;
    }
    const phase = transferPhase(o, today);
    if (phase === "remind") {
      const { data: got } = await admin.from("plan_orders").update({ pay_reminded_at: new Date().toISOString() }).eq("id", o.id).is("pay_reminded_at", null).select("id");
      if (!got || got.length === 0) continue;
      await deps.sendMails(
        [o.contact_email],
        "【ストレスチェックWeb】お振込みの期限が近づいています",
        [...head(o), `${title(o)}のお振込みが、まだ確認できていません。期限までにお振込みをお願いいたします(すでにお振込み済みの場合は、確認までしばらくお待ちください)。`, "", ...transferGuide(o), "", "期限までにご入金が確認できない場合、このお申込みは自動で取り消されます(ご請求はありません)。", ...foot(origin)].join("\n")
      );
      out.reminded++;
    } else if (phase === "overdue") {
      const r = await cancelTransferOrder(admin, o, "期限までにお振込みが確認できませんでした", deps);
      if (!r.ok) continue;
      await deps.sendMails(
        [o.contact_email],
        "【ストレスチェックWeb】お振込みが確認できなかったため、お申込みを取り消しました",
        [...head(o), `${title(o)}について、期限(${o.pay_due})までにご入金が確認できなかったため、お申込みを取り消しました(ご請求はありません)。`, "引き続きご利用の場合は、ログイン後の画面からもう一度お申込みください。", "", "※ 行き違いでお振込みいただいた場合は、返金のお手続きをいたしますので、下記までご連絡ください。", ...foot(origin)].join("\n")
      );
      await deps.sendMails(await deps.officeEmails(admin), "【ストレスチェックWeb】銀行振込の入金がなく、申込を取り消しました", `${orderSummary(o, o.seats_granted ?? o.seats)}\nお振込みの期限: ${o.pay_due}`);
      out.cancelled++;
    }
  }
  return out;
}
