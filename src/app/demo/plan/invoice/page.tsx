import { DemoNotice } from "../../DemoNotice";
import { InvoiceSheet } from "@/components/InvoiceSheet";
import { invoiceFromOrder } from "@/lib/receipt";
import { transferDue } from "@/lib/bank-transfer";
import { SELLER } from "@/lib/org";
import { getFiscalYear } from "@/lib/fiscal";
import { jstToday } from "@/lib/plan";

export const metadata = { title: "請求書(サンプル) | ストレスチェックWeb" };
export const dynamic = "force-dynamic";

// 紹介用: Web申込(銀行振込)の請求書の見本(架空の会社・金額・口座)
export default function DemoInvoicePage() {
  const r = invoiceFromOrder(
    {
      id: "3f2a9c1e-0000-0000-0000-000000000000",
      kind: "new",
      company_name: "株式会社サンプル商事",
      fiscal_year: getFiscalYear(),
      seats: 30,
      amount: 9900,
      created_at: new Date().toISOString(),
      pay_due: transferDue(jstToday()),
      pay_url: null,
      pay_info: {
        bank: { bankName: "見本銀行", bankCode: "0000", branchName: "見本支店", branchCode: "000", accountType: "普通", accountNumber: "0000000", holder: "(見本)ストライプジャパン(カ" },
        remaining: 9900,
      },
    },
    SELLER.invoiceRegistrationNo
  );
  return (
    <>
      <div className="no-print" style={{ maxWidth: 760, margin: "0 auto 12px" }}>
        <DemoNotice />
      </div>
      <InvoiceSheet r={r} />
    </>
  );
}
