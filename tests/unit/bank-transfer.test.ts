import { describe, expect, it, vi } from "vitest";
import { BANK_TRANSFER_DAYS, bankLines, shortBy, transferDue, transferGuide, transferInstructions, transferPhase } from "@/lib/bank-transfer";
import { cancelTransferOrder, noteAwaitingTransfer, sweepBankTransfers, type BankDeps, type BankOrder } from "@/lib/plan-bank";
import { checkoutParams, createCheckoutSession, ensureCustomer, type CheckoutOptions } from "@/lib/stripe";
import { invoiceFromOrder, receiptFromOrder } from "@/lib/receipt";
import { salesRows, SALES_HEADERS } from "@/lib/plan";

// Stripe の決済(PaymentIntent)の next_action(銀行振込の案内)
const nextAction = (remaining: number) => ({
  type: "display_bank_transfer_instructions",
  display_bank_transfer_instructions: {
    amount_remaining: remaining,
    currency: "jpy",
    hosted_instructions_url: "https://payments.stripe.com/bank_transfers/instructions/test_abc",
    reference: null,
    type: "jp_bank_transfer",
    financial_addresses: [
      { type: "zengin", supported_networks: ["zengin"], zengin: { account_holder_name: "ストライプジヤパン(カ", account_number: "1234567", account_type: "futsu", bank_code: "0009", bank_name: "三井住友銀行", branch_code: "950", branch_name: "東京第一支店" } },
    ],
  },
});
const bank = { bankName: "三井住友銀行", bankCode: "0009", branchName: "東京第一支店", branchCode: "950", accountType: "普通", accountNumber: "1234567", holder: "ストライプジヤパン(カ" };

describe("銀行振込: 計算と文面", () => {
  it("期限は申込から14日後", () => {
    expect(BANK_TRANSFER_DAYS).toBe(14);
    expect(transferDue("2026-11-23")).toBe("2026-12-07");
    expect(transferDue("2026-12-25")).toBe("2027-01-08");
  });

  it("Stripe の案内から、振込先・残りの金額・案内ページを取り出す", () => {
    const r = transferInstructions(nextAction(9900))!;
    expect(r.url).toBe("https://payments.stripe.com/bank_transfers/instructions/test_abc");
    expect(r.info.remaining).toBe(9900);
    expect(r.info.bank).toEqual(bank);
    expect(bankLines(r.info.bank!)).toEqual(["銀行名: 三井住友銀行(銀行コード 0009)", "支店名: 東京第一支店(支店コード 950)", "口座: 普通 1234567", "口座名義: ストライプジヤパン(カ"]);
    // 当座
    const toza = nextAction(100);
    toza.display_bank_transfer_instructions.financial_addresses[0].zengin.account_type = "toza";
    expect(transferInstructions(toza)!.info.bank!.accountType).toBe("当座");
    // 銀行振込の案内でないもの・口座のないもの
    expect(transferInstructions(null)).toBeNull();
    expect(transferInstructions({ type: "redirect_to_url" })).toBeNull();
    expect(transferInstructions({ type: "display_bank_transfer_instructions", display_bank_transfer_instructions: { amount_remaining: 5, hosted_instructions_url: null } })!.info.bank).toBeNull();
  });

  it("一部だけ入金されているときの不足額", () => {
    expect(shortBy(9900, 9900)).toBe(0); // まだ入金なし
    expect(shortBy(9900, 440)).toBe(440); // 振込手数料が引かれた など
    expect(shortBy(9900, 0)).toBe(0);
    expect(shortBy(9900, null)).toBe(0);
  });

  it("毎日の見回りで何をするか(期限の3日前に1回お知らせ・期限の翌日に取り消し)", () => {
    const o = { pay_due: "2026-12-07", pay_reminded_at: null };
    expect(transferPhase(o, "2026-12-03")).toBe("wait");
    expect(transferPhase(o, "2026-12-04")).toBe("remind");
    expect(transferPhase({ ...o, pay_reminded_at: "2026-12-04T00:00:00Z" }, "2026-12-05")).toBe("wait");
    expect(transferPhase(o, "2026-12-07")).toBe("remind"); // 期限の当日はまだ取り消さない
    expect(transferPhase({ ...o, pay_reminded_at: "x" }, "2026-12-07")).toBe("wait");
    expect(transferPhase(o, "2026-12-08")).toBe("overdue");
    expect(transferPhase({ pay_due: null, pay_reminded_at: null }, "2026-12-08")).toBe("wait");
  });

  it("ご案内の文面: 振込先・金額・期限。一部入金のときは残りの金額", () => {
    const g = transferGuide({ amount: 9900, pay_due: "2026-12-07", pay_url: "https://example.test/i", pay_info: { bank, remaining: 9900 } }).join("\n");
    expect(g).toContain("口座: 普通 1234567");
    expect(g).toContain("お振込み金額: 9,900円(税込)");
    expect(g).toContain("お振込みの期限: 2026年12月7日");
    expect(g).toContain("https://example.test/i");
    expect(g).toContain("振込手数料は、お客さまのご負担");
    const s = transferGuide({ amount: 9900, pay_due: "2026-12-07", pay_url: null, pay_info: { bank, remaining: 440 } }).join("\n");
    expect(s).toContain("お振込み金額: 440円(税込)(お申込み金額 9,900円のうち、未入金の分)");
    // 振込先を取り出せなかったとき
    expect(transferGuide({ amount: 9900, pay_due: "2026-12-07", pay_url: "u", pay_info: null }).join("\n")).toContain("お振込み先は、下のページでご確認ください。");
  });
});

const opts: CheckoutOptions = { orderId: "o1", email: "a@example.com", lines: [{ name: "x", unitAmount: 330, quantity: 30 }], successUrl: "s", cancelUrl: "c", invoiceFooter: "f", invoiceDescription: "d" };

describe("銀行振込: 決済画面", () => {
  it("カードのみ(今までどおり): 支払い方法は指定せず、メールアドレスで顧客を作る", () => {
    const p = checkoutParams(opts, false);
    expect(p.customer_email).toBe("a@example.com");
    expect(p.customer_creation).toBe("always");
    expect(p.customer).toBeUndefined();
    expect(p.payment_method_types).toBeUndefined();
    expect(p.payment_method_options).toBeUndefined();
  });

  it("銀行振込も選べる: 会社の顧客を渡し、カードと銀行振込(日本)を指定する", () => {
    const p = checkoutParams({ ...opts, customerId: "cus_1" }, false);
    expect(p.customer).toBe("cus_1");
    expect(p.customer_email).toBeUndefined(); // 顧客と同時には渡せない
    expect(p.customer_creation).toBeUndefined();
    expect(p.payment_method_types).toEqual(["card", "customer_balance"]);
    expect(p.payment_method_options).toEqual({ customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "jp_bank_transfer" } } });
    expect(p.customer_update).toBeUndefined();
    expect(checkoutParams({ ...opts, customerId: "cus_1" }, true).customer_update).toEqual({ address: "auto" });
    // 領収書・申込IDは同じ
    expect(p.invoice_creation?.enabled).toBe(true);
    expect(p.metadata).toEqual({ order_id: "o1" });
  });

  it("銀行振込つきで作れなければ、カードのみで作り直す(申込は止めない)", async () => {
    const calls: { bank: boolean; key: string }[] = [];
    const stripe = {
      checkout: {
        sessions: {
          create: async (p: { customer?: unknown }, o: { idempotencyKey: string }) => {
            calls.push({ bank: Boolean(p.customer), key: o.idempotencyKey });
            if (p.customer) throw new Error("The payment method type customer_balance is invalid");
            return { id: "cs_card", url: "https://checkout.test/card" };
          },
        },
      },
    };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await createCheckoutSession({ ...opts, customerId: "cus_1" }, stripe as never);
    err.mockRestore();
    expect(r).toEqual({ id: "cs_card", url: "https://checkout.test/card", bank: false, bankError: "The payment method type customer_balance is invalid" });
    expect(calls).toEqual([{ bank: true, key: "checkout-o1-bank" }, { bank: false, key: "checkout-o1" }]);
    // うまくいくとき・カードのみのとき
    const ok = { checkout: { sessions: { create: async () => ({ id: "cs_1", url: "u" }) } } };
    expect(await createCheckoutSession({ ...opts, customerId: "cus_1" }, ok as never)).toEqual({ id: "cs_1", url: "u", bank: true });
    expect(await createCheckoutSession(opts, ok as never)).toEqual({ id: "cs_1", url: "u", bank: false });
  });

  it("会社の顧客: あれば更新して使い続け、なければ(または消されていれば)作る", async () => {
    const log: string[] = [];
    const api = (updateFails: boolean, deleted = false) => ({
      customers: {
        create: async (p: { name?: string; email?: string; metadata?: unknown }) => { log.push(`create ${p.name} ${p.email} ${JSON.stringify(p.metadata)}`); return { id: "cus_new" }; },
        update: async (id: string) => { log.push(`update ${id}`); if (updateFails) throw new Error("No such customer"); return { id, deleted }; },
      },
    });
    const c = { companyId: "c1", name: "株式会社サンプル 本社", email: "a@example.com" };
    expect(await ensureCustomer({ ...c, existingId: null }, api(false) as never)).toBe("cus_new");
    expect(await ensureCustomer({ ...c, existingId: "cus_old" }, api(false) as never)).toBe("cus_old");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await ensureCustomer({ ...c, existingId: "cus_gone" }, api(true) as never)).toBe("cus_new");
    err.mockRestore();
    expect(await ensureCustomer({ ...c, existingId: "cus_del" }, api(false, true) as never)).toBe("cus_new");
    expect(log[0]).toBe('create 株式会社サンプル 本社 a@example.com {"company_id":"c1"}');
    expect(log.filter((l) => l.startsWith("update"))).toEqual(["update cus_old", "update cus_gone", "update cus_del"]);
  });
});

// ---- にせのデータベース(plan_orders だけ)とにせの Stripe・メール ----
function fakeDb(rows: BankOrder[]) {
  const from = () => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let patch: Record<string, unknown> | null = null;
    const run = () => {
      const hit = rows.filter((r) => filters.every((f) => f(r as unknown as Record<string, unknown>)));
      if (patch) hit.forEach((r) => Object.assign(r, patch));
      return hit.map((r) => ({ ...r }));
    };
    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: Record<string, unknown>) => ((patch = p), q),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), q),
      order: () => q,
      limit: () => q,
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res({ data: run(), error: null }),
    };
    return q;
  };
  return { from } as never;
}
const order = (over: Partial<BankOrder> = {}): BankOrder => ({
  id: "11111111-1111-4111-8111-111111111111", kind: "new", status: "pending", company_id: "c1", fiscal_year: 2026, seats: 30, amount: 9900, company_name: "株式会社サンプル商事", office_name: "本社", address: null,
  contact_name: "見本 太郎", contact_email: "tanto@example.com", contact_phone: null, workers: 32, questionnaire: "57", seats_granted: 30, exam_start: "2026-12-10", exam_end: "2027-01-10", interview_option: "own", error: null,
  stripe_payment_intent: null, pay_method: null, pay_due: null, pay_url: null, pay_info: null, pay_reminded_at: null, pay_short_at: null, ...over,
});
function deps(today: string, state: { status: string; remaining: number } | Error) {
  const mails: { to: string[]; subject: string; text: string }[] = [];
  const cancelled: string[] = [];
  const d: BankDeps = {
    today: () => today,
    paymentState: async () => {
      if (state instanceof Error) throw state;
      return { status: state.status, amount: 9900, nextAction: state.status === "requires_action" ? nextAction(state.remaining) : null };
    },
    cancelPayment: async (id) => { cancelled.push(id); },
    sendMails: async (to, subject, text) => { mails.push({ to, subject, text }); },
    officeEmails: async () => ["office@example.com"],
  };
  return { d, mails, cancelled };
}

describe("銀行振込: お振込み待ちの流れ", () => {
  it("決済画面で銀行振込が選ばれたら、振込先と期限を控えて、担当者と実施者に案内する(1回だけ)", async () => {
    const rows = [order()];
    const { d, mails } = deps("2026-11-23", { status: "requires_action", remaining: 9900 });
    expect(await noteAwaitingTransfer(fakeDb(rows), rows[0].id, "pi_1", "https://stres.example", d)).toBe(true);
    expect(rows[0]).toMatchObject({ pay_method: "bank_transfer", pay_due: "2026-12-07", stripe_payment_intent: "pi_1", status: "pending" });
    expect(rows[0].pay_info?.bank).toEqual(bank);
    expect(mails.map((m) => [m.to[0], m.subject])).toEqual([
      ["tanto@example.com", "【ストレスチェックWeb】お振込みのご案内(2026年度のお申込み)"],
      ["office@example.com", "【ストレスチェックWeb】銀行振込のお申込みがありました(お振込み待ち)"],
    ]);
    expect(mails[0].text).toContain("口座: 普通 1234567");
    expect(mails[0].text).toContain("お振込みの期限: 2026年12月7日");
    expect(mails[0].text).toContain("https://stres.example/plan/invoice/11111111-1111-4111-8111-111111111111");
    // 健康情報は載らない(会社名・担当者名・金額・振込先だけ)
    expect(mails[0].text).not.toMatch(/高ストレス|結果/);
    // Stripe が同じ通知を送り直しても、二重に案内しない
    expect(await noteAwaitingTransfer(fakeDb(rows), rows[0].id, "pi_1", "https://stres.example", d)).toBe(false);
    expect(mails).toHaveLength(2);
  });

  it("振込先を Stripe から取り出せなくても、案内は送る(振込先はページで確認)", async () => {
    const rows = [order()];
    const { d, mails } = deps("2026-11-23", new Error("permission"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await noteAwaitingTransfer(fakeDb(rows), rows[0].id, "pi_1", "https://stres.example", d)).toBe(true);
    err.mockRestore();
    expect(rows[0].pay_info).toBeNull();
    expect(mails[0].text).toContain("お申込みのときに表示された画面(決済代行会社 Stripe のページ)でご確認ください");
    // 実施者には、振込先を取り出せなかったことを知らせる
    expect(mails[1].text).toContain("APIキーの権限(PaymentIntents: 書き込み)をご確認ください");
  });

  const waiting = (over: Partial<BankOrder> = {}) => order({ pay_method: "bank_transfer", pay_due: "2026-12-07", stripe_payment_intent: "pi_1", pay_info: { bank, remaining: 9900 }, pay_url: "https://payments.stripe.com/bank_transfers/instructions/test_abc", ...over });

  it("見回り: 期限の3日前に1回だけお知らせ", async () => {
    const rows = [waiting()];
    const a = deps("2026-12-03", { status: "requires_action", remaining: 9900 });
    expect(await sweepBankTransfers(fakeDb(rows), "https://stres.example", a.d)).toEqual({ reminded: 0, short: 0, cancelled: 0 });
    const b = deps("2026-12-04", { status: "requires_action", remaining: 9900 });
    expect(await sweepBankTransfers(fakeDb(rows), "https://stres.example", b.d)).toEqual({ reminded: 1, short: 0, cancelled: 0 });
    expect(b.mails.map((m) => m.subject)).toEqual(["【ストレスチェックWeb】お振込みの期限が近づいています"]);
    expect(b.mails[0].to).toEqual(["tanto@example.com"]);
    const c = deps("2026-12-05", { status: "requires_action", remaining: 9900 });
    expect(await sweepBankTransfers(fakeDb(rows), "https://stres.example", c.d)).toEqual({ reminded: 0, short: 0, cancelled: 0 });
    expect(c.mails).toHaveLength(0);
  });

  it("見回り: 期限を過ぎても入金がなければ、Stripe の決済ごと取り消して知らせる", async () => {
    const rows = [waiting({ pay_reminded_at: "2026-12-04T00:00:00Z" })];
    const a = deps("2026-12-07", { status: "requires_action", remaining: 9900 });
    expect((await sweepBankTransfers(fakeDb(rows), "https://stres.example", a.d)).cancelled).toBe(0); // 期限の当日は待つ
    const b = deps("2026-12-08", { status: "requires_action", remaining: 9900 });
    expect(await sweepBankTransfers(fakeDb(rows), "https://stres.example", b.d)).toEqual({ reminded: 0, short: 0, cancelled: 1 });
    expect(b.cancelled).toEqual(["pi_1"]);
    expect(rows[0]).toMatchObject({ status: "expired", error: "期限までにお振込みが確認できませんでした" });
    expect(b.mails.map((m) => [m.to[0], m.subject])).toEqual([
      ["tanto@example.com", "【ストレスチェックWeb】お振込みが確認できなかったため、お申込みを取り消しました"],
      ["office@example.com", "【ストレスチェックWeb】銀行振込の入金がなく、申込を取り消しました"],
    ]);
  });

  it("見回り: 金額が足りない入金は、残りの金額を1回だけ知らせる。期限を過ぎても自動では取り消さない", async () => {
    const rows = [waiting()];
    const a = deps("2026-11-30", { status: "requires_action", remaining: 440 });
    expect(await sweepBankTransfers(fakeDb(rows), "https://stres.example", a.d)).toEqual({ reminded: 0, short: 1, cancelled: 0 });
    expect(rows[0].pay_info?.remaining).toBe(440);
    expect(a.mails.map((m) => m.subject)).toEqual(["【ストレスチェックWeb】ご入金の金額が不足しています", "【ストレスチェックWeb】銀行振込の入金額が不足しています(要確認)"]);
    expect(a.mails[0].text).toContain("金額が 440円 不足しています");
    expect(a.mails[0].text).toContain("お振込み金額: 440円(税込)");
    const b = deps("2026-12-20", { status: "requires_action", remaining: 440 });
    expect(await sweepBankTransfers(fakeDb(rows), "https://stres.example", b.d)).toEqual({ reminded: 0, short: 0, cancelled: 0 });
    expect(b.cancelled).toEqual([]);
    expect(rows[0].status).toBe("pending");
  });

  it("見回り: 入金済み・状況が分からないときは、何もしない(取り消さない)", async () => {
    const rows = [waiting()];
    const a = deps("2026-12-20", { status: "succeeded", remaining: 0 });
    expect(await sweepBankTransfers(fakeDb(rows), "https://stres.example", a.d)).toEqual({ reminded: 0, short: 0, cancelled: 0 });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const b = deps("2026-12-20", new Error("network"));
    expect(await sweepBankTransfers(fakeDb(rows), "https://stres.example", b.d)).toEqual({ reminded: 0, short: 0, cancelled: 0 });
    err.mockRestore();
    expect(rows[0].status).toBe("pending");
    expect([...a.cancelled, ...b.cancelled]).toEqual([]);
  });

  it("取り消し: 入金のないものだけ。入金済み・一部入金は取り消せない", async () => {
    const r1 = [waiting()];
    const a = deps("2026-11-25", { status: "requires_action", remaining: 9900 });
    expect(await cancelTransferOrder(fakeDb(r1), r1[0], "担当者が取り消しました", a.d)).toEqual({ ok: true });
    expect(a.cancelled).toEqual(["pi_1"]);
    expect(r1[0]).toMatchObject({ status: "expired", error: "担当者が取り消しました" });

    const r2 = [waiting()];
    const b = deps("2026-11-25", { status: "succeeded", remaining: 0 });
    expect(await cancelTransferOrder(fakeDb(r2), r2[0], "x", b.d)).toMatchObject({ ok: false, error: expect.stringContaining("ご入金を確認済み") });
    const c = deps("2026-11-25", { status: "requires_action", remaining: 440 });
    expect(await cancelTransferOrder(fakeDb(r2), r2[0], "x", c.d)).toMatchObject({ ok: false, error: expect.stringContaining("一部のご入金(9,460円)") });
    expect([...b.cancelled, ...c.cancelled]).toEqual([]);
    expect(r2[0].status).toBe("pending");
    // カードの決済待ち・開設済みの申込は対象外
    expect(await cancelTransferOrder(fakeDb([]), order(), "x", a.d)).toMatchObject({ ok: false });
    expect(await cancelTransferOrder(fakeDb([]), waiting({ status: "provisioned" }), "x", a.d)).toMatchObject({ ok: false });
  });
});

describe("銀行振込: 請求書・領収書・売上明細", () => {
  it("請求書: 番号・発行日・期限・振込先・未入金の金額", () => {
    const o = { ...order({ pay_due: "2026-12-07", pay_url: "u", pay_info: { bank, remaining: 440 } }), created_at: "2026-11-23T01:00:00Z" };
    const r = invoiceFromOrder(o, "T7130003006446");
    expect(r).toMatchObject({ no: "B2026-11111111", issuedDate: "2026-11-23", dueDate: "2026-12-07", companyName: "株式会社サンプル商事", amount: 9900, remaining: 440, registrationNo: "T7130003006446", payUrl: "u" });
    expect(r.bank).toEqual(bank);
    expect(r.purpose).toBe("2026年度 ストレスチェック(受検者30名分・集団分析込み)");
  });

  it("領収書・売上明細に、お支払い方法が出る", () => {
    const base = { id: "3f2a9c1e-0000-0000-0000-000000000000", company_name: "x", fiscal_year: 2026, kind: "new" as const, seats: 30, amount: 9900, paid_at: "2026-11-25T01:00:00Z" };
    expect(receiptFromOrder({ ...base, pay_method: "bank_transfer" }, "T1").method).toBe("bank_transfer");
    expect(receiptFromOrder(base, "T1").method).toBe("card");
    const sales = { ...base, status: "provisioned", office_name: null, contact_name: "a", contact_email: "a@example.com", created_at: base.paid_at, stripe_payment_intent: "pi", stripe_invoice_id: "in" };
    const rows = salesRows([{ ...sales, pay_method: "bank_transfer" }, { ...sales, id: "2" }]);
    const col = SALES_HEADERS.indexOf("支払方法");
    expect(col).toBe(SALES_HEADERS.length - 1);
    expect(rows.map((r) => r[col])).toEqual(["銀行振込", "クレジットカード"]);
    expect(rows[0][8]).toBe(9900); // 金額の列の位置は変えない
  });
});
