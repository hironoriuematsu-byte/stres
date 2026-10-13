import { DemoNotice } from "../../DemoNotice";
import { ReceiptSheet } from "@/components/ReceiptSheet";
import { receiptFromOrder } from "@/lib/receipt";
import { SELLER } from "@/lib/org";
import { getFiscalYear } from "@/lib/fiscal";

export const metadata = { title: "領収書(サンプル) | ストレスチェックWeb" };
export const dynamic = "force-dynamic";

// 紹介用: Web申込の領収書の見本(架空の会社・金額)
export default function DemoReceiptPage() {
  const r = receiptFromOrder(
    {
      id: "3f2a9c1e-0000-0000-0000-000000000000",
      kind: "new",
      company_name: "株式会社サンプル商事",
      fiscal_year: getFiscalYear(),
      seats: 30,
      amount: 9900,
      paid_at: new Date().toISOString(),
    },
    SELLER.invoiceRegistrationNo
  );
  return (
    <>
      <div className="no-print" style={{ maxWidth: 760, margin: "0 auto 12px" }}>
        <DemoNotice />
      </div>
      <ReceiptSheet r={r} />
    </>
  );
}
