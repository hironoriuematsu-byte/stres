"use client";

import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";
import { formatJpDate, taxIncluded } from "@/lib/plan";

export type ReceiptData = {
  no: string; // 領収書番号
  paidDate: string; // 決済日(YYYY-MM-DD・日本時間)
  companyName: string;
  amount: number; // 税込
  purpose: string; // 但し書き
  registrationNo: string;
};

// Web申込の領収書(適格請求書の記載事項を満たす)。画面で表示し、印刷・PDF保存できる。
// クレジットカード決済のため、収入印紙は不要
export function ReceiptSheet({ r, stripeHref }: { r: ReceiptData; stripeHref?: string }) {
  const tax = taxIncluded(r.amount);
  const td = { padding: "8px 12px", border: `1px solid #B9C9C6`, fontSize: 14 } as const;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .receipt-sheet { border: none !important; box-shadow: none !important; margin: 0 !important; }
        }
        @page { size: A4; margin: 18mm; }
      `}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        {stripeHref && (
          <a href={stripeHref} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: brand.tealDark, alignSelf: "center", marginRight: 8 }}>
            決済代行会社(Stripe)の領収書を開く
          </a>
        )}
        <button
          onClick={() => window.print()}
          style={{ background: brand.teal, color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          印刷 / PDFとして保存
        </button>
      </div>

      <div className="receipt-sheet" style={{ background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 12, padding: "36px 40px", color: "#1F2D2B" }}>
        <h1 style={{ textAlign: "center", fontSize: 28, letterSpacing: "0.6em", margin: "0 0 24px", paddingLeft: "0.6em" }}>領収書</h1>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#44534F", marginBottom: 20, flexWrap: "wrap", gap: 6 }}>
          <span>No. {r.no}</span>
          <span>発行日 {formatJpDate(r.paidDate)}</span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, borderBottom: "1px solid #1F2D2B", paddingBottom: 6, marginBottom: 22, display: "inline-block", minWidth: "60%" }}>
          {r.companyName} 御中
        </div>

        <div style={{ textAlign: "center", margin: "6px 0 18px" }}>
          <div
            style={{
              display: "inline-block",
              fontSize: 30,
              fontWeight: 800,
              letterSpacing: "0.05em",
              padding: "10px 36px",
              background: "#F4FAF9",
              borderTop: "2px solid #1F2D2B",
              borderBottom: "2px solid #1F2D2B",
            }}
          >
            ¥{r.amount.toLocaleString()}-<span style={{ fontSize: 15, fontWeight: 700, marginLeft: 6 }}>(税込)</span>
          </div>
        </div>

        <p style={{ fontSize: 15, margin: "0 0 6px" }}>但し {r.purpose}として</p>
        <p style={{ fontSize: 15, margin: "0 0 22px" }}>上記正に領収いたしました。</p>

        <table style={{ borderCollapse: "collapse", marginBottom: 20 }}>
          <tbody>
            <tr>
              <td style={{ ...td, background: "#EEF5F4", fontWeight: 700 }}>税率</td>
              <td style={{ ...td, background: "#EEF5F4", fontWeight: 700 }}>対象金額(税込)</td>
              <td style={{ ...td, background: "#EEF5F4", fontWeight: 700 }}>うち消費税</td>
            </tr>
            <tr>
              <td style={td}>10%</td>
              <td style={{ ...td, textAlign: "right" }}>{r.amount.toLocaleString()}円</td>
              <td style={{ ...td, textAlign: "right" }}>{tax.toLocaleString()}円</td>
            </tr>
          </tbody>
        </table>

        <p style={{ fontSize: 13, color: "#44534F", margin: "0 0 28px" }}>
          お支払方法: クレジットカード決済(決済日 {formatJpDate(r.paidDate)})
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 14, lineHeight: 1.8, textAlign: "left" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{SELLER.issuerName}</div>
            <div>{SELLER.address}</div>
            <div>登録番号 {r.registrationNo}</div>
            <div>{SELLER.email}</div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "#5B6B6A", margin: "28px 0 0", lineHeight: 1.7 }}>
          ※ 本書は適格請求書(インボイス)を兼ねます。クレジットカード決済によるお支払いのため、収入印紙は貼付しておりません。
        </p>
      </div>
    </div>
  );
}
