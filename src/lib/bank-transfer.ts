// ============================================================
// Web申込の銀行振込(画面とサーバーの両方から使う、計算と文面だけの部分)。
// 銀行振込は、決済代行会社(Stripe)が会社ごとに用意する振込先の口座(バーチャル口座)に振り込んでもらい、
// 入金は Stripe が自動で照合する。入金が確認されるまで、お申込みは「お振込み待ち」になる。
// ============================================================

import { addDays, formatJpDate } from "@/lib/plan";

// お振込みの期限(お申込みの日から。この日を過ぎても入金がなければ、申込を取り消す)
export const BANK_TRANSFER_DAYS = 14;
// 期限の何日前に、もう一度お知らせするか
export const BANK_TRANSFER_REMIND_DAYS = 3;

export const transferDue = (orderedOn: string): string => addDays(orderedOn, BANK_TRANSFER_DAYS);

// 振込先(Stripe が発行する口座)
export type BankInfo = {
  bankName: string;
  bankCode: string;
  branchName: string;
  branchCode: string;
  accountType: string; // 普通 / 当座
  accountNumber: string;
  holder: string; // 口座名義
};
// 申込に控えておく内容: 振込先と、残りの金額(一部だけ入金されたときに減る)
export type PayInfo = { bank: BankInfo | null; remaining: number | null; reference?: string | null };

export const accountTypeLabel = (t: string | null | undefined): string => (t === "toza" ? "当座" : t === "futsu" ? "普通" : (t ?? ""));

type Str = string | null | undefined;
// Stripe の決済(PaymentIntent)の next_action から、振込先・残りの金額・案内ページを取り出す。
// 銀行振込の案内でなければ null
export function transferInstructions(nextAction: unknown): { url: string | null; info: PayInfo } | null {
  const na = nextAction as { type?: string; display_bank_transfer_instructions?: Record<string, unknown> } | null | undefined;
  const d = na?.type === "display_bank_transfer_instructions" ? na.display_bank_transfer_instructions : null;
  if (!d) return null;
  const list = Array.isArray(d.financial_addresses) ? (d.financial_addresses as { type?: string; zengin?: Record<string, Str> }[]) : [];
  const z = list.find((a) => a.type === "zengin" && a.zengin)?.zengin ?? null;
  const s = (v: Str) => (typeof v === "string" ? v.trim() : "");
  const bank: BankInfo | null =
    z && s(z.account_number)
      ? {
          bankName: s(z.bank_name),
          bankCode: s(z.bank_code),
          branchName: s(z.branch_name),
          branchCode: s(z.branch_code),
          accountType: accountTypeLabel(s(z.account_type)),
          accountNumber: s(z.account_number),
          holder: s(z.account_holder_name),
        }
      : null;
  return {
    url: typeof d.hosted_instructions_url === "string" ? d.hosted_instructions_url : null,
    info: {
      bank,
      remaining: typeof d.amount_remaining === "number" ? d.amount_remaining : null,
      reference: typeof d.reference === "string" ? d.reference : null,
    },
  };
}

// 振込先を、メールや画面に出す行にする
export function bankLines(bank: BankInfo): string[] {
  return [
    `銀行名: ${bank.bankName}${bank.bankCode ? `(銀行コード ${bank.bankCode})` : ""}`,
    `支店名: ${bank.branchName}${bank.branchCode ? `(支店コード ${bank.branchCode})` : ""}`,
    `口座: ${bank.accountType} ${bank.accountNumber}`,
    `口座名義: ${bank.holder}`,
  ];
}

// 入金の状況: 一部だけ入金されている(金額が足りない)か
export function shortBy(amount: number, remaining: number | null | undefined): number {
  return typeof remaining === "number" && remaining > 0 && remaining < amount ? remaining : 0;
}

// 毎日の見回りで、お振込み待ちの申込に何をするか
//   remind: 期限が近いことを知らせる / overdue: 期限を過ぎたので取り消す / wait: 何もしない
export function transferPhase(o: { pay_due: string | null; pay_reminded_at: string | null }, today: string): "wait" | "remind" | "overdue" {
  if (!o.pay_due) return "wait";
  if (today > o.pay_due) return "overdue";
  if (!o.pay_reminded_at && today >= addDays(o.pay_due, -BANK_TRANSFER_REMIND_DAYS)) return "remind";
  return "wait";
}

// お振込みのご案内(メール本文の、振込先の部分)
export function transferGuide(o: { amount: number; pay_due: string | null; pay_url: string | null; pay_info: PayInfo | null }): string[] {
  const remaining = shortBy(o.amount, o.pay_info?.remaining);
  return [
    "■ お振込み先",
    ...(o.pay_info?.bank
      ? bankLines(o.pay_info.bank)
      : o.pay_url
        ? ["お振込み先は、下のページでご確認ください。"]
        : ["お振込み先は、お申込みのときに表示された画面(決済代行会社 Stripe のページ)でご確認ください。分からない場合は、お手数ですがお問い合わせください。"]),
    `お振込み金額: ${(remaining || o.amount).toLocaleString()}円(税込)${remaining ? `(お申込み金額 ${o.amount.toLocaleString()}円のうち、未入金の分)` : ""}`,
    `お振込みの期限: ${formatJpDate(o.pay_due)}`,
    ...(o.pay_url ? ["", "振込先の確認(決済代行会社 Stripe のページ):", o.pay_url] : []),
    "",
    "※ この口座は、貴社専用の振込先です(決済代行会社 Stripe が発行しています)。ご入金は自動で確認されます。",
    "※ 振込手数料は、お客さまのご負担でお願いいたします。金額が不足すると、ご入金の確認ができません。",
    "※ ご入金の確認後に、受検の準備が整います(確認までに、銀行の営業日で1〜2日かかることがあります)。",
  ];
}
