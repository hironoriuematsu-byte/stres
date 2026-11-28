"use client";

import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";
import { formatJpDate, taxIncluded } from "@/lib/plan";
import type { BankInfo } from "@/lib/bank-transfer";

export type InvoiceData = {
  no: string; // 請求書番号
  issuedDate: string; // 発行日(お申込みの日。YYYY-MM-DD・日本時間)
  dueDate: string | null; // お振込みの期限
  companyName: string;
  amount: number; // ご請求金額(税込)
  remaining: number; // 未入金の金額(一部だけ入金されているとき。そうでなければ 0)
  purpose: string; // 品名
  registrationNo: string;
  bank: BankInfo | null;
  payUrl: string | null; // 振込先を表示する Stripe のページ
};

// Web申込(銀行振込)の請求書。お振込み待ちの間、担当者が経理の方へ渡せるように、画面で表示し、印刷・PDF保存できる。
// 適格請求書(インボイス)は、ご入金後の領収書で発行する(同じ取引に2通出さない)
export function InvoiceSheet({ r }: { r: InvoiceData }) {
  const tax = taxIncluded(r.amount);
  const td = { padding: "8px 12px", border: `1px solid #B9C9C6`, fontSize: 14 } as const;
  const th = { ...td, background: "#EEF5F4", fontWeight: 700, whiteSpace: "nowrap" } as const;
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
        {r.payUrl && (
          <a href={r.payUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: brand.tealDark, alignSelf: "center", marginRight: 8 }}>
            振込先のページを開く(Stripe)
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
        <h1 style={{ textAlign: "center", fontSize: 28, letterSpacing: "0.6em", margin: "0 0 24px", paddingLeft: "0.6em" }}>請求書</h1>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#44534F", marginBottom: 20, flexWrap: "wrap", gap: 6 }}>
          <span>No. {r.no}</span>
          <span>発行日 {formatJpDate(r.issuedDate)}</span>
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, borderBottom: "1px solid #1F2D2B", paddingBottom: 6, marginBottom: 14, display: "inline-block", minWidth: "60%" }}>
          {r.companyName} 御中
        </div>
        <p style={{ fontSize: 14, margin: "0 0 14px" }}>下記のとおりご請求申し上げます。</p>

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
            <span style={{ fontSize: 15, fontWeight: 700, marginRight: 10 }}>ご請求金額</span>¥{r.amount.toLocaleString()}-<span style={{ fontSize: 15, fontWeight: 700, marginLeft: 6 }}>(税込)</span>
          </div>
        </div>

        <table style={{ borderCollapse: "collapse", marginBottom: 18, width: "100%" }}>
          <tbody>
            <tr>
              <td style={th}>品名</td>
              <td style={{ ...th, textAlign: "right" }}>金額(税込)</td>
              <td style={{ ...th, textAlign: "right" }}>うち消費税(10%)</td>
            </tr>
            <tr>
              <td style={td}>{r.purpose}</td>
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{r.amount.toLocaleString()}円</td>
              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>{tax.toLocaleString()}円</td>
            </tr>
          </tbody>
        </table>

        <table style={{ borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <td style={th}>お振込みの期限</td>
              <td style={{ ...td, fontWeight: 700 }}>{formatJpDate(r.dueDate)}</td>
            </tr>
            {r.remaining > 0 && (
              <tr>
                <td style={th}>未入金の金額</td>
                <td style={{ ...td, fontWeight: 700 }}>{r.remaining.toLocaleString()}円(一部のご入金を確認しています)</td>
              </tr>
            )}
            {r.bank ? (
              <>
                <tr>
                  <td style={th}>銀行・支店</td>
                  <td style={td}>
                    {r.bank.bankName}
                    {r.bank.bankCode && `(銀行コード ${r.bank.bankCode})`} {r.bank.branchName}
                    {r.bank.branchCode && `(支店コード ${r.bank.branchCode})`}
                  </td>
                </tr>
                <tr>
                  <td style={th}>口座</td>
                  <td style={{ ...td, fontWeight: 700 }}>
                    {r.bank.accountType} {r.bank.accountNumber}
                  </td>
                </tr>
                <tr>
                  <td style={th}>口座名義</td>
                  <td style={td}>{r.bank.holder}</td>
                </tr>
              </>
            ) : (
              <tr>
                <td style={th}>お振込み先</td>
                <td style={td}>ログイン後の画面の「振込先のページを開く」からご確認ください</td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ fontSize: 12.5, color: "#44534F", margin: "0 0 26px", lineHeight: 1.8 }}>
          ※ 上記の口座は、貴社専用の振込先です(決済代行会社 Stripe が発行しています)。ご入金は自動で確認されます。
          <br />※ 振込手数料は、貴社のご負担でお願いいたします。
          <br />※ 期限までにご入金が確認できない場合、お申込みは取り消しとなります(ご請求はなくなります)。
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
          ※ ご入金の確認後、適格請求書(インボイス)を兼ねた領収書を発行します(ログイン後の画面の「お支払いの記録」から表示・保存できます)。
        </p>
      </div>
    </div>
  );
}
