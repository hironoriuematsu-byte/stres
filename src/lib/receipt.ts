import { jstDate, MIN_TOTAL, seatsGranted } from "@/lib/plan";
import type { ReceiptData } from "@/components/ReceiptSheet";
import type { InvoiceData } from "@/components/InvoiceSheet";
import { shortBy, type PayInfo } from "@/lib/bank-transfer";

type ReceiptOrder = {
  id: string;
  kind: "new" | "add_seats" | "renew";
  company_name: string;
  fiscal_year: number;
  seats: number;
  amount: number;
  paid_at: string;
  seats_granted?: number | null; // 申込時点の料金で決まった受検人数枠(最低料金のときは申込人数より多い)
  pay_method?: string | null; // お支払い方法(SQL 0036 以降。記録がなければカード)
};

// 申込の内容(但し書き・請求書の品名)
export function orderPurpose(o: Omit<ReceiptOrder, "paid_at">): string {
  return (
    o.kind === "add_seats"
      ? `${o.fiscal_year}年度 ストレスチェック 受検人数の追加(${o.seats}名分)`
      : o.seats_granted != null
        ? o.seats_granted > o.seats
          ? `${o.fiscal_year}年度 ストレスチェック(最低料金・受検者${o.seats_granted}名まで・集団分析込み)`
          : `${o.fiscal_year}年度 ストレスチェック(受検者${o.seats}名分・集団分析込み)`
        : o.amount === MIN_TOTAL && o.seats < seatsGranted(o.seats)
          ? `${o.fiscal_year}年度 ストレスチェック(最低料金・受検者${seatsGranted(o.seats)}名まで・集団分析込み)`
        : `${o.fiscal_year}年度 ストレスチェック(受検者${o.seats}名分・集団分析込み)`
  );
}

// 申込(支払い)から領収書の記載内容を作る
export function receiptFromOrder(o: ReceiptOrder, registrationNo: string): ReceiptData {
  const purpose = orderPurpose(o);
  return {
    no: `R${o.fiscal_year}-${o.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    paidDate: jstDate(o.paid_at),
    companyName: o.company_name,
    amount: o.amount,
    purpose,
    registrationNo,
    method: o.pay_method === "bank_transfer" ? "bank_transfer" : "card",
  };
}

// お振込み待ちの申込から、請求書の記載内容を作る
export function invoiceFromOrder(
  o: Omit<ReceiptOrder, "paid_at"> & { created_at: string; pay_due: string | null; pay_url: string | null; pay_info: PayInfo | null },
  registrationNo: string
): InvoiceData {
  return {
    no: `B${o.fiscal_year}-${o.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    issuedDate: jstDate(o.created_at),
    dueDate: o.pay_due,
    companyName: o.company_name,
    amount: o.amount,
    remaining: shortBy(o.amount, o.pay_info?.remaining),
    purpose: orderPurpose(o),
    registrationNo,
    bank: o.pay_info?.bank ?? null,
    payUrl: o.pay_url,
  };
}
