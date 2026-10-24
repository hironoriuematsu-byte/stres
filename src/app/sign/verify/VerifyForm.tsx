"use client";

import { useState } from "react";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { formatJst } from "@/lib/contract";

type Result = { found: boolean; signedAt?: string | null; documentMatches?: boolean; chainValid?: boolean; signatureValid?: boolean | null };

export function VerifyForm() {
  const [no, setNo] = useState("");
  const [hash, setHash] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [r, setR] = useState<Result | null>(null);
  const input = { width: "100%", padding: "10px 12px", fontSize: 15, border: `1px solid ${brand.line}`, borderRadius: 9, boxSizing: "border-box" as const, marginTop: 4 };

  const check = async () => {
    setBusy(true);
    setErr(null);
    setR(null);
    try {
      const res = await fetch(`/api/contracts/verify?no=${encodeURIComponent(no.trim())}&hash=${encodeURIComponent(hash.trim())}`);
      const json = (await res.json().catch(() => ({}))) as Result & { error?: string };
      if (!res.ok) setErr(json.error ?? `通信エラー(${res.status})`);
      else setR(json);
    } finally {
      setBusy(false);
    }
  };

  const row = (label: string, ok: boolean | null | undefined, okText: string, ngText: string) => (
    <li style={{ fontSize: 14, lineHeight: 1.9, color: ok ? brand.tealDark : ok === false ? "#B02A2A" : "#5B6B6A" }}>
      {ok ? "✅" : ok === false ? "❌" : "ℹ️"} {label}: {ok ? okText : ok === false ? ngText : "確認できません(事業者署名の鍵が未設定)"}
    </li>
  );

  return (
    <Card style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, color: brand.ink, margin: "0 0 6px" }}>契約書の確認(真正性の検証)</h1>
      <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.9, margin: "0 0 14px" }}>
        うえまつ産業医事務所と電子契約で締結した契約書について、お手元の契約書に記載の「契約番号」と「文面のハッシュ(SHA-256)」を入力すると、
        当事務所に保存されている締結済みの契約書と一致するか、署名の記録が改変されていないかを確認できます。契約の内容は表示されません。
      </p>
      <label style={{ fontSize: 13, color: "#44534F", display: "block", marginBottom: 10 }}>
        契約番号(例: E2026-3F2A9C1E)
        <input value={no} onChange={(e) => setNo(e.target.value)} style={input} />
      </label>
      <label style={{ fontSize: 13, color: "#44534F", display: "block", marginBottom: 14 }}>
        文面のハッシュ(SHA-256・64桁)
        <input value={hash} onChange={(e) => setHash(e.target.value)} style={{ ...input, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13 }} />
      </label>
      <Btn onClick={check} disabled={busy || !no || !hash}>
        {busy ? "確認中…" : "確認する"}
      </Btn>
      {err && <p style={{ fontSize: 14, color: "#B02A2A", margin: "12px 0 0" }}>{err}</p>}
      {r && !r.found && <p style={{ fontSize: 14, color: "#B02A2A", margin: "12px 0 0" }}>この契約番号の締結済みの契約書は見つかりません。</p>}
      {r && r.found && (
        <ul style={{ margin: "14px 0 0", paddingLeft: 4, listStyle: "none" }}>
          <li style={{ fontSize: 14, lineHeight: 1.9 }}>締結日時: {formatJst(r.signedAt)}</li>
          {row("文面", r.documentMatches, "保存されている契約書の文面と一致します", "一致しません(お手元の契約書と内容が異なります)")}
          {row("署名の記録", r.chainValid, "記録の連鎖に改変はありません", "記録の連鎖が一致しません")}
          {row("事業者署名", r.signatureValid, "有効です", "無効です")}
        </ul>
      )}
    </Card>
  );
}
