import { jstDate, MIN_TOTAL, seatsGranted } from "@/lib/plan";
import type { ReceiptData } from "@/components/ReceiptSheet";

type ReceiptOrder = {
  id: string;
  kind: "new" | "add_seats" | "renew";
  company_name: string;
  fiscal_year: number;
  seats: number;
  amount: number;
  paid_at: string;
};

// 申込(支払い)から領収書の記載内容を作る
export function receiptFromOrder(o: ReceiptOrder, registrationNo: string): ReceiptData {
  const purpose =
    o.kind === "add_seats"
      ? `${o.fiscal_year}年度 ストレスチェック 受検人数の追加(${o.seats}名分)`
      : o.amount === MIN_TOTAL && o.seats < seatsGranted(o.seats)
        ? `${o.fiscal_year}年度 ストレスチェック(最低料金・受検者${seatsGranted(o.seats)}名まで・集団分析込み)`
        : `${o.fiscal_year}年度 ストレスチェック(受検者${o.seats}名分・集団分析込み)`;
  return {
    no: `R${o.fiscal_year}-${o.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
    paidDate: jstDate(o.paid_at),
    companyName: o.company_name,
    amount: o.amount,
    purpose,
    registrationNo,
  };
}
