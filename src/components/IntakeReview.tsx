"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { postJson } from "@/lib/api-client";
import { logAccess } from "@/lib/log";
import { Badge, Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { RISK_LABEL, type IntakeMessage, type IntakeStatus, type IntakeSummary, type RiskLevel } from "@/lib/intake";

export type IntakeRecord = {
  id: string;
  request_id: string;
  company_id: string;
  status: IntakeStatus;
  risk_level: RiskLevel;
  messages: IntakeMessage[];
  summary: IntakeSummary | null;
  reply_draft: string | null;
  reply: string | null;
  reply_sent_at: string | null;
};

export const riskTone = (r: RiskLevel): "red" | "orange" | "teal" | "gray" =>
  r === "high" ? "red" : r === "moderate" ? "orange" : r === "low" ? "teal" : "gray";

// 実施者(医師)向け: 事前ヒアリングの要約・会話記録・本人への返信
export function IntakeReview({ intake, personName, onChanged, demo }: { intake: IntakeRecord; personName: string; onChanged: () => void; demo?: boolean }) {
  const [reply, setReply] = useState(intake.reply ?? intake.reply_draft ?? "");
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = intake.summary;

  const send = async () => {
    if (demo) return setMsg({ ok: true, text: "(デモ)実際の画面では、本人のマイページに返信が表示され、お知らせメールが届きます。" });
    if (!window.confirm(`${personName}さんに、この返信を送りますか？(本人のマイページに表示され、お知らせメールが届きます)`)) return;
    setBusy(true);
    setMsg(null);
    const { ok, json } = await postJson("/api/intake/reply", { intakeId: intake.id, reply });
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: json.error ?? "送信できませんでした" });
    setMsg({ ok: true, text: "本人に返信を送りました。" });
    onChanged();
  };
  const resummarize = async () => {
    if (demo) return setMsg({ ok: true, text: "(デモ)実際の画面では、AIが要約と返信の下書きを作り直します。" });
    setBusy(true);
    setMsg(null);
    const { ok, json } = await postJson("/api/intake/finish", { intakeId: intake.id });
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: json.error ?? "作り直せませんでした" });
    setMsg({ ok: true, text: "要約と返信の下書きを作り直しました。" });
    onChanged();
  };
  const openLog = () => {
    setShowLog((v) => !v);
    if (!showLog && !demo) logAccess(createClient(), "view_intake_log", intake.id, intake.company_id);
  };

  const row = (label: string, value?: string) => (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8, fontSize: 13, lineHeight: 1.7, padding: "4px 0", borderBottom: `1px solid ${brand.line}` }}>
      <div style={{ color: "#5B6B6A", fontWeight: 700 }}>{label}</div>
      <div style={{ color: brand.ink, whiteSpace: "pre-wrap" }}>{value || "—"}</div>
    </div>
  );

  return (
    <div style={{ background: "#FAFCFC", border: `1px solid ${brand.line}`, borderRadius: 10, padding: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14, color: brand.ink }}>事前ヒアリング(AI)の要約</strong>
        <Badge tone={riskTone(intake.risk_level)}>緊急度: {RISK_LABEL[intake.risk_level]}</Badge>
        {intake.status === "in_progress" && <Badge tone="gray">本人が聞き取り中</Badge>}
      </div>
      {s ? (
        <div>
          {row("主な困りごと", s.chief_complaint)}
          {row("心身の状態", s.symptoms)}
          {row("ストレス要因", s.stressors)}
          {row("勤務の状況", s.work_status)}
          {row("受診・服薬", s.medical)}
          {row("相談相手", s.support)}
          {row("本人の希望", s.wishes)}
          {row("緊急度の根拠", s.risk_notes)}
          {row("面談で確認", (s.points_to_confirm ?? []).map((p) => `・${p}`).join("\n"))}
          {row("措置の候補(案)", (s.measure_candidates ?? []).map((p) => `・${p}`).join("\n"))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#5B6B6A" }}>
          {intake.status === "in_progress" ? "本人が聞き取りを終えると、要約がここに表示されます。" : "要約がまだありません。"}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#8A9694", lineHeight: 1.6 }}>AIによる要約です。判断は会話の記録と面談で確認してください。</div>

      <div>
        <button onClick={openLog} style={{ background: "none", border: 0, padding: 0, color: brand.tealDark, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {showLog ? "▲" : "▼"} 会話の記録({intake.messages.filter((m) => m.role === "user").length}往復)
        </button>
        {showLog && (
          <div style={{ marginTop: 8, display: "grid", gap: 6, maxHeight: 360, overflowY: "auto" }}>
            {intake.messages.map((m, i) => (
              <div key={i} style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                <strong style={{ color: m.role === "user" ? brand.tealDark : "#7A8886" }}>{m.role === "user" ? "本人" : "AI"}:</strong> {m.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {intake.status !== "in_progress" && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 4 }}>
            本人への返信{intake.reply_sent_at ? `(${new Date(intake.reply_sent_at).toLocaleDateString("ja-JP")} 送信済み)` : "(AIの下書き。確認・修正してから送信)"}
          </div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={9}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, lineHeight: 1.8, border: `1px solid ${brand.line}`, borderRadius: 10 }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <Btn onClick={send} disabled={busy || !reply.trim()}>{intake.reply_sent_at ? "修正して送り直す" : "本人に送信"}</Btn>
            <Btn tone="ghost" onClick={resummarize} disabled={busy}>要約と下書きを作り直す</Btn>
          </div>
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: msg.ok ? brand.tealDark : "#B02A2A" }}>{msg.text}</div>}
    </div>
  );
}
