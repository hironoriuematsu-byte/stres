"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { formatJpDate } from "@/lib/plan";
import { displayStatus, formatJst, STATUS_LABEL } from "@/lib/contract";

type Row = {
  id: string;
  contract_no: string;
  status: string;
  party_name: string;
  signer_name: string;
  signer_email: string;
  monthly_fee: number | null;
  start_date: string | null;
  token_expires_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
};

// 実施事務従事者: 自社とうえまつ産業医事務所の契約書(送信済み・締結済み)の一覧。
// 読める範囲はデータベース側(RLS)で自社分に限られる
export function CompanyContractsPanel({ companyName }: { companyName: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("contracts")
        .select("id, contract_no, status, party_name, signer_name, signer_email, monthly_fee, start_date, token_expires_at, sent_at, signed_at")
        .order("updated_at", { ascending: false });
      if (error) setError(error.message);
      setRows((data as Row[]) ?? []);
    })();
  }, []);

  return (
    <Card>
      <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>契約書(電子契約)</h3>
      <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 14px" }}>
        {companyName} とうえまつ産業医事務所との間の産業医業務委託契約書です。締結済みの契約書は、合意締結証明(署名の記録)とあわせていつでも閲覧・印刷(PDF保存)できます。
        署名は、契約書の送付先の方がメールのリンクから行います。
      </p>
      {error && <p style={{ fontSize: 13, color: "#B02A2A" }}>読み込めませんでした: {error}</p>}
      {rows === null ? (
        <p style={{ fontSize: 14, color: "#5B6B6A", margin: 0 }}>読み込み中…</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 14, color: "#5B6B6A", margin: 0 }}>契約書はまだありません。産業医契約をご希望の場合は、うえまつ産業医事務所(support@mestate.jp)までご連絡ください。</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r) => {
            const st = displayStatus(r.status, r.token_expires_at);
            return (
              <div key={r.id} style={{ border: `1px solid ${brand.line}`, borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge tone={STATUS_LABEL[st].tone}>{STATUS_LABEL[st].label}</Badge>
                    <span style={{ fontSize: 12, color: "#7A8886" }}>{r.contract_no}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: brand.ink, marginTop: 6 }}>産業医業務委託契約書</div>
                  <div style={{ fontSize: 13, color: "#44534F", lineHeight: 1.8 }}>
                    契約開始 {formatJpDate(r.start_date)} / 月額 {(r.monthly_fee ?? 0).toLocaleString()}円(税込) / 署名者 {r.signer_name}
                    {r.signed_at ? ` / 締結 ${formatJst(r.signed_at)}` : r.sent_at ? ` / 送付 ${formatJst(r.sent_at)}` : ""}
                  </div>
                </div>
                <a
                  href={`/contracts/${r.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: brand.teal, color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  契約書を開く
                </a>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
