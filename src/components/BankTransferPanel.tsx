"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { postJson } from "@/lib/api-client";
import { shortBy, type PayInfo } from "@/lib/bank-transfer";
import { formatJpDate, jstToday } from "@/lib/plan";

export type AwaitingOrder = {
  id: string;
  kind: "new" | "add_seats" | "renew";
  fiscal_year: number;
  seats: number;
  amount: number;
  pay_due: string | null;
  pay_url: string | null;
  pay_info: PayInfo | null;
};

// Web申込の企業: 銀行振込を選んだお申込みのうち、まだ入金が確認できていないもの。
// 振込先・金額・期限を表示し、請求書の印刷と、お申込みの取り消しができる
export function BankTransferPanel({ companyId, canEdit, preview }: { companyId: string; canEdit: boolean; preview?: AwaitingOrder[] }) {
  const [orders, setOrders] = useState<AwaitingOrder[]>(preview ?? []);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    createClient()
      .from("plan_orders")
      .select("id, kind, fiscal_year, seats, amount, pay_due, pay_url, pay_info")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .eq("pay_method", "bank_transfer")
      .order("created_at")
      .then(({ data, error }) => setOrders(error ? [] : ((data as AwaitingOrder[]) ?? []))); // 列がまだないとき(SQL 0036 の実行前)は何も出さない
  }, [companyId, preview]);

  if (orders.length === 0) return null;

  const cancel = async (o: AwaitingOrder) => {
    if (preview) return setErr("(デモ)実際の画面では、お申込みを取り消します。");
    if (!window.confirm("このお申込みを取り消します。よろしいですか？\n(取り消したあとにお振込みいただいても、お支払いには充てられません。すでにお振込み済みの場合は、取り消さずにお待ちください)")) return;
    setBusy(o.id);
    setErr(null);
    const { ok, json } = await postJson<{ ok?: boolean }>("/api/plan/order/cancel", { orderId: o.id });
    if (!ok) {
      setErr(json.error ?? "取り消せませんでした");
      setBusy(null);
      return;
    }
    window.location.reload();
  };

  const today = jstToday();
  const th = { padding: "5px 12px 5px 0", fontSize: 13, color: "#5B6B6A", whiteSpace: "nowrap", verticalAlign: "top", textAlign: "left", fontWeight: 400 } as const;
  const td = { padding: "5px 0", fontSize: 14, color: brand.ink, fontWeight: 700 } as const;
  const link = { color: brand.tealDark, fontWeight: 700, fontSize: 13 } as const;

  return (
    <Card style={{ borderColor: "#E9B98C" }}>
      <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 4px" }}>お振込み待ちのお申込み</h3>
      <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.75, margin: "0 0 10px" }}>
        下の口座へお振込みください。ご入金は自動で確認され、確認できると受検の準備が整います(担当者の方にメールでお知らせします)。確認までに、銀行の営業日で1〜2日かかることがあります。
      </p>
      {orders.map((o) => {
        const short = shortBy(o.amount, o.pay_info?.remaining);
        const late = Boolean(o.pay_due && today > o.pay_due);
        const bank = o.pay_info?.bank ?? null;
        return (
          <div key={o.id} style={{ borderTop: `1px solid ${brand.line}`, padding: "12px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
              <strong style={{ fontSize: 14.5, color: brand.ink }}>
                {o.fiscal_year}年度 {o.kind === "add_seats" ? `受検人数の追加(${o.seats}名)` : `ストレスチェックのお申込み(${o.seats}名)`}
              </strong>
              {short > 0 ? <Badge tone="red">金額が不足しています</Badge> : <Badge tone="orange">お振込み待ち</Badge>}
            </div>
            <table style={{ borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <th style={th}>お振込み金額</th>
                  <td style={td}>
                    {(short || o.amount).toLocaleString()}円(税込)
                    {short > 0 && <span style={{ fontWeight: 400, fontSize: 12.5, color: "#B02A2A", marginLeft: 8 }}>お申込み金額 {o.amount.toLocaleString()}円のうち、未入金の分</span>}
                  </td>
                </tr>
                <tr>
                  <th style={th}>お振込みの期限</th>
                  <td style={{ ...td, color: late ? "#B02A2A" : brand.ink }}>
                    {formatJpDate(o.pay_due)}
                    <span style={{ fontWeight: 400, fontSize: 12.5, color: "#5B6B6A", marginLeft: 8 }}>
                      {short > 0 ? "不足分のお振込みをお願いします" : "期限までにご入金が確認できない場合、お申込みは自動で取り消されます"}
                    </span>
                  </td>
                </tr>
                {bank ? (
                  <>
                    <tr>
                      <th style={th}>銀行・支店</th>
                      <td style={td}>
                        {bank.bankName}
                        {bank.bankCode && <span style={{ fontWeight: 400, fontSize: 12.5 }}>(銀行コード {bank.bankCode})</span>} {bank.branchName}
                        {bank.branchCode && <span style={{ fontWeight: 400, fontSize: 12.5 }}>(支店コード {bank.branchCode})</span>}
                      </td>
                    </tr>
                    <tr>
                      <th style={th}>口座</th>
                      <td style={td}>
                        {bank.accountType} {bank.accountNumber}
                      </td>
                    </tr>
                    <tr>
                      <th style={th}>口座名義</th>
                      <td style={td}>{bank.holder}</td>
                    </tr>
                  </>
                ) : (
                  <tr>
                    <th style={th}>お振込み先</th>
                    <td style={{ ...td, fontWeight: 400 }}>「振込先のページを開く」からご確認ください</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: "#5B6B6A", lineHeight: 1.7, marginTop: 4 }}>
              この口座は、貴社専用の振込先です(決済代行会社 Stripe が発行)。振込手数料は、お客さまのご負担でお願いいたします。
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
              <a href={preview ? "/demo/plan/invoice" : `/plan/invoice/${o.id}`} target="_blank" rel="noreferrer" style={link}>
                請求書を表示(印刷・PDF保存)
              </a>
              {o.pay_url && (
                <a href={o.pay_url} target="_blank" rel="noreferrer" style={link}>
                  振込先のページを開く(Stripe)
                </a>
              )}
              {canEdit && short === 0 && (
                <Btn tone="ghost" onClick={() => cancel(o)} disabled={busy === o.id} style={{ padding: "5px 12px", fontSize: 12.5 }}>
                  {busy === o.id ? "取り消しています…" : "このお申込みを取り消す"}
                </Btn>
              )}
            </div>
          </div>
        );
      })}
      {err && <p style={{ fontSize: 13, color: "#B02A2A", margin: "4px 0 0" }}>{err}</p>}
    </Card>
  );
}
