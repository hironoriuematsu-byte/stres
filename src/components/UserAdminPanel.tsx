"use client";

import { useState } from "react";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Company } from "@/lib/types";
import { parseInviteCsv } from "@/lib/parse-csv";

type InvitePayload = {
  email: string;
  company_code: string;
  role: "employee" | "jimu";
};

const input = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "9px 11px",
  fontSize: 14,
  border: `1px solid ${brand.line}`,
  borderRadius: 9,
};

export function UserAdminPanel({ companies }: { companies: Company[] }) {
  const [form, setForm] = useState({
    email: "",
    company_code: companies[0]?.code ?? "",
    role: "employee" as InvitePayload["role"],
  });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const send = async (invites: InvitePayload[]) => {
    setBusy(true);
    setLog([`${invites.length}件の招待を送信中…`]);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invites }),
      });
      const body = await res.json();
      if (!res.ok) {
        setLog([`エラー: ${body.error ?? res.statusText}`]);
      } else {
        setLog(
          (body.results as { email: string; ok: boolean; error?: string }[]).map((r) =>
            r.ok ? `✓ ${r.email} を招待しました` : `✗ ${r.email}: ${r.error}`
          )
        );
      }
    } catch (e) {
      setLog([`通信エラー: ${String(e)}`]);
    }
    setBusy(false);
  };

  const submitSingle = (e: React.FormEvent) => {
    e.preventDefault();
    send([{ ...form }]);
  };

  const onCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseInviteCsv(text);
    if (rows.length === 0) {
      setLog(["CSVから有効な行が読み取れませんでした(メール, 企業コード の2列)"]);
      return;
    }
    send(rows.map((r) => ({ ...r, role: "employee" as const })));
  };

  return (
    <Card>
      <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>ユーザー管理(招待)</h3>
      <p style={{ fontSize: 13, color: "#5B6B6A", margin: "0 0 14px", lineHeight: 1.7 }}>
        招待メールが本人に送信され、本人がパスワードを設定するとログインできるようになります。氏名・社員番号・部署は本人が受検時に入力します(管理者側では設定しません)。
      </p>

      <form onSubmit={submitSingle} style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: brand.ink }}>メールアドレス</label>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={input} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: brand.ink }}>企業</label>
          <select value={form.company_code} onChange={(e) => setForm({ ...form, company_code: e.target.value })} style={input}>
            {companies.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}({c.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: brand.ink }}>ロール</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as InvitePayload["role"] })}
            style={input}
          >
            <option value="employee">従業員</option>
            <option value="jimu">実施事務従事者</option>
          </select>
        </div>
        <div style={{ alignSelf: "end" }}>
          <Btn type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "送信中…" : "招待を送る"}
          </Btn>
        </div>
      </form>

      <div style={{ marginTop: 18, borderTop: `1px solid ${brand.line}`, paddingTop: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 6 }}>
          従業員の一括登録(CSV: メール, 企業コード)
        </label>
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCsv(f);
            e.target.value = "";
          }}
          style={{ fontSize: 13 }}
        />
      </div>

      {log.length > 0 && (
        <div
          style={{
            marginTop: 14,
            background: "#F4FAF9",
            border: `1px solid ${brand.line}`,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 13,
            color: brand.ink,
            lineHeight: 1.9,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </Card>
  );
}
