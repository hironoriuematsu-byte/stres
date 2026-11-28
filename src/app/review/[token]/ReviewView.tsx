"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card } from "@/components/ui";
import { ContractSheet } from "@/components/ContractSheet";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";
import { type ContractDoc, formatJst, partyLabels } from "@/lib/contract";

type Feedback = { kind: "ok" | "revise"; at: string | null; comment: string | null };

export function ReviewView({ token, doc, signerName, updatedAt, feedback }: { token: string; doc: ContractDoc; signerName: string; updatedAt: string; feedback: Feedback | null }) {
  const router = useRouter();
  const labels = partyLabels(doc);
  const [mode, setMode] = useState<"ok" | "revise" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const send = async (kind: "ok" | "revise") => {
    if (kind === "revise" && !comment.trim()) {
      setMsg({ ok: false, text: "修正してほしい点を入力してください" });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/contracts/review-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, kind, comment }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? `通信エラー(${res.status})` });
        return;
      }
      setMsg({ ok: true, text: kind === "ok" ? "「この内容で問題ない」と送信者に伝えました。電子署名用のリンクは別のメールで届きます。" : "修正の希望を送信者に伝えました。" });
      setMode(null);
      setComment("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const input = { width: "100%", padding: "10px 12px", fontSize: 15, border: `1px solid ${brand.line}`, borderRadius: 9, boxSizing: "border-box" as const, fontFamily: "inherit" };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card className="no-print" style={{ borderColor: brand.orange }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Badge tone="orange">案文の確認(署名はできません)</Badge>
            <h2 style={{ fontSize: 18, color: brand.ink, margin: "8px 0 2px" }}>{doc.title}(案文)</h2>
            <div style={{ fontSize: 13, color: "#5B6B6A" }}>
              送信者: うえまつ産業医事務所({SELLER.name}) / 宛先: {signerName} 様 / 案文の最終更新 {formatJst(updatedAt)}
            </div>
          </div>
          <button onClick={() => window.print()} style={{ background: "#fff", color: brand.tealDark, border: `1px solid ${brand.teal}`, borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            印刷 / PDFとして保存
          </button>
        </div>
        <p style={{ fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "12px 0 0" }}>
          これは契約書の<b>案文(下書き)</b>です。このページでは電子署名はできず、<b>このページの操作で契約が成立することはありません</b>。
          内容をご確認のうえ、問題がなければ下の「この内容で問題ありません」を、直してほしい点があれば「修正を希望する」からお知らせください。
          送信者が案文を直した場合も、同じリンクで最新の内容が見られます。内容が固まりましたら、電子署名用のリンクを別のメールでお送りします。
        </p>
      </Card>

      {feedback && (
        <Card className="no-print">
          <p style={{ fontSize: 13.5, color: "#44534F", margin: 0, lineHeight: 1.8 }}>
            前回の回答({formatJst(feedback.at)}): <b>{feedback.kind === "ok" ? "この内容で問題ない" : "修正を希望"}</b>
            {feedback.comment ? ` / ${feedback.comment}` : ""}
            <br />
            <span style={{ color: "#7A8886", fontSize: 12.5 }}>案文が更新されている場合は、改めて下の回答をお送りください。</span>
          </p>
        </Card>
      )}

      {msg && (
        <Card className="no-print" style={{ borderColor: msg.ok ? brand.teal : "#E0A0A0", background: msg.ok ? "#F2FAF9" : "#FFF6F6" }}>
          <p style={{ margin: 0, fontSize: 14, color: msg.ok ? brand.tealDark : "#B02A2A", lineHeight: 1.8 }}>{msg.text}</p>
        </Card>
      )}

      <ContractSheet doc={doc} otsuSign={null} koSign={null} watermark="案文(未確定・署名不可)">
        <div className="no-print" style={{ marginTop: 24, border: `2px solid ${brand.orange}`, borderRadius: 12, padding: "18px 20px", background: "#FFF9F4" }}>
          <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>{labels.party}({doc.ko.role ?? "契約先"})からの回答</h3>
          <p style={{ fontSize: 13, color: "#5B6B6A", margin: "0 0 12px", lineHeight: 1.7 }}>回答は送信者にメールで届きます。ここでの回答は電子署名ではなく、契約は成立しません。</p>
          {mode === null ? (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn onClick={() => setMode("ok")} disabled={busy}>
                この内容で問題ありません
              </Btn>
              <Btn tone="ghost" onClick={() => setMode("revise")} disabled={busy}>
                修正を希望する
              </Btn>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: 13, color: "#44534F", display: "block" }}>
                {mode === "ok" ? "送信者へのひとこと(任意)" : "修正してほしい点(必須。該当する条・項と希望する内容)"}
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} style={{ ...input, marginTop: 4 }} />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <Btn tone={mode === "ok" ? "teal" : "orange"} onClick={() => send(mode)} disabled={busy}>
                  {busy ? "送信中…" : mode === "ok" ? "「問題なし」を送る" : "修正の希望を送る"}
                </Btn>
                <Btn tone="ghost" onClick={() => setMode(null)} disabled={busy} style={{ borderColor: brand.line, color: "#5B6B6A" }}>
                  やめる
                </Btn>
              </div>
            </div>
          )}
        </div>
      </ContractSheet>
    </div>
  );
}
