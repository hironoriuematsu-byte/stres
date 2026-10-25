"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { postJson } from "@/lib/api-client";
import { logAccess } from "@/lib/log";
import { Badge, Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { RISK_LABEL, SHARE_OPTIONS, type IntakeMessage, type IntakeStatus, type IntakeSummary, type RiskLevel, type ShareConsent } from "@/lib/intake";

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
  share_consent?: ShareConsent | null;
  company_share_draft?: string | null;
  company_share?: string | null;
  company_shared_at?: string | null;
  company_shared_by?: string | null;
  summary_error?: string | null;
};

export const riskTone = (r: RiskLevel): "red" | "orange" | "teal" | "gray" =>
  r === "high" ? "red" : r === "moderate" ? "orange" : r === "low" ? "teal" : "gray";

// 実施者(医師)向け: 事前問診の要約・会話記録・本人への返信
export function IntakeReview({ intake, personName, onChanged, demo }: { intake: IntakeRecord; personName: string; onChanged: () => void; demo?: boolean }) {
  const [reply, setReply] = useState(intake.reply ?? intake.reply_draft ?? "");
  const [share, setShare] = useState(intake.company_share ?? intake.company_share_draft ?? "");
  const consentKeys = intake.share_consent?.keys ?? [];
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const s = intake.summary;
  const inProgress = intake.status === "in_progress";
  const answered = intake.messages.some((m) => m.role === "user");

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
  const shareToCompany = async () => {
    if (demo) return setMsg({ ok: true, text: "(デモ)実際の画面では、会社の担当者(実施事務従事者)の面接指導申出の一覧に表示され、共有が届いたことだけがメールで知らされます。" });
    if (!window.confirm("この内容を会社の担当者(実施事務従事者)に共有しますか？(メールには内容を書かず、届いたことだけを知らせます)")) return;
    setBusy(true);
    setMsg(null);
    const { ok, json } = await postJson("/api/intake/share", { intakeId: intake.id, text: share });
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: json.error ?? "共有できませんでした" });
    setMsg({ ok: true, text: "会社の担当者に共有しました。" });
    onChanged();
  };
  const resummarize = async () => {
    if (demo) return setMsg({ ok: true, text: "(デモ)実際の画面では、AIが要約と返信の下書きを作り直します。" });
    setBusy(true);
    setMsg(null);
    const { ok, json } = await postJson("/api/intake/finish", { intakeId: intake.id });
    setBusy(false);
    if (!ok) return setMsg({ ok: false, text: json.error ?? "作り直せませんでした" });
    setMsg({ ok: true, text: inProgress ? "途中までの内容で要約を作りました。" : "要約と返信の下書きを作り直しました。" });
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
        <strong style={{ fontSize: 14, color: brand.ink }}>事前問診(AI)の要約</strong>
        <Badge tone={riskTone(intake.risk_level)}>緊急度: {RISK_LABEL[intake.risk_level]}</Badge>
        {inProgress && <Badge tone="gray">本人が回答の途中</Badge>}
        {s?.partial && <Badge tone="orange">途中までの回答の要約{s.generated_at ? `(${new Date(s.generated_at).toLocaleDateString("ja-JP")})` : ""}</Badge>}
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
          {row("就業上の措置の案", (s.measure_candidates ?? []).map((p) => `・${p}`).join("\n"))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#5B6B6A" }}>
          {inProgress
            ? answered
              ? "本人が回答の途中です。終えると要約がここに表示されます。途中のまま2日たつと、途中までの内容で自動で要約を作ります。面談が近いときは、下のボタンで今すぐ作れます。"
              : "本人はまだ回答していません。"
            : intake.summary_error
              ? `${intake.summary_error}「要約と下書きを作り直す」を押してください。`
              : "要約を作成しています(1分ほど)。少し待ってから画面を開き直してください。"}
        </div>
      )}
      {inProgress && answered && (
        <div>
          <Btn tone="ghost" onClick={resummarize} disabled={busy}>
            {busy ? "作っています(1分ほど)…" : s ? "最新の回答で要約を作り直す" : "途中までの内容で要約を作る"}
          </Btn>
        </div>
      )}
      {s?.opinion && (
        <div style={{ borderTop: `1px solid ${brand.line}`, paddingTop: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: brand.ink, marginBottom: 4 }}>面接指導結果報告書・意見書の下書き(AI案)</div>
          <div style={{ fontSize: 12, color: "#8A6B2E", marginBottom: 6 }}>事前問診だけで作った案です。面談で確かめてから、医師の判断で確定してください。</div>
          {row("勤務の状況", s.opinion.work_condition)}
          {row("疲労の蓄積", s.opinion.fatigue)}
          {row("心理的な負担", s.opinion.psych_burden)}
          {row("その他の心身", s.opinion.other_health)}
          {row("指導区分(案)", s.opinion.guidance)}
          {row("就業区分(案)", s.opinion.work_category)}
          {row("就業上の措置(案)", (s.opinion.measures ?? []).length > 0 ? s.opinion.measures.map((m) => `・${m}`).join("\n") : "なし")}
          {row("措置期間(案)", s.opinion.measure_period)}
          {row("職場環境の改善", s.opinion.environment)}
          {row("受診の配慮等", s.opinion.medical_care)}
          {row("根拠・面談で確認", s.opinion.basis)}
          <button
            onClick={() => {
              const o = s.opinion!;
              const text = [
                "【面接指導結果報告書・意見書(下書き)】",
                `勤務の状況: ${o.work_condition}`,
                `疲労の蓄積の状況: ${o.fatigue}`,
                `心理的な負担の状況: ${o.psych_burden}`,
                `その他の心身の状況: ${o.other_health}`,
                `本人への指導区分: ${o.guidance}`,
                `就業区分: ${o.work_category}`,
                `就業上の措置: ${(o.measures ?? []).join("、") || "なし"}`,
                `措置期間: ${o.measure_period}`,
                `職場環境の改善に関する意見: ${o.environment}`,
                `医療機関への受診の配慮等: ${o.medical_care}`,
              ].join("\n");
              navigator.clipboard?.writeText(text).then(
                () => setMsg({ ok: true, text: "意見書の下書きをコピーしました。" }),
                () => setMsg({ ok: false, text: "コピーできませんでした。" })
              );
            }}
            style={{ marginTop: 8, background: "#fff", border: `1px solid ${brand.teal}`, color: brand.tealDark, borderRadius: 8, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
          >
            意見書の下書きをコピー
          </button>
        </div>
      )}
      <div style={{ fontSize: 12, color: "#8A9694", lineHeight: 1.6 }}>AIによる要約です。判断は会話の記録と面談で確認してください。</div>

      <div>
        <button onClick={openLog} style={{ background: "none", border: 0, padding: 0, color: brand.tealDark, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          {showLog ? "▲" : "▼"} 会話の記録(本人の回答{intake.messages.filter((m) => m.role === "user").length}回)
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
      {intake.status !== "in_progress" && (
        <div style={{ borderTop: `1px solid ${brand.line}`, paddingTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 4 }}>
            会社の担当者(実施事務従事者)への共有
            {intake.company_shared_at &&
              `(${new Date(intake.company_shared_at).toLocaleDateString("ja-JP")} ${intake.company_shared_by ? "医師が共有" : "本人の同意により自動で送信"})`}
          </div>
          <div style={{ fontSize: 12.5, color: "#5B6B6A", lineHeight: 1.7, marginBottom: 6 }}>
            本人が選んだ範囲:{" "}
            {consentKeys.length > 0 ? SHARE_OPTIONS.filter((o) => consentKeys.includes(o.key)).map((o) => o.label.replace(/\(.*\)/, "")).join("・") : "なし(共有しない)"}
            {intake.share_consent?.note && (
              <>
                <br />
                伝えてほしくないこと: {intake.share_consent.note}
              </>
            )}
          </div>
          {consentKeys.length > 0 && (
            <>
              <textarea
                value={share}
                onChange={(e) => setShare(e.target.value)}
                rows={5}
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, lineHeight: 1.8, border: `1px solid ${brand.line}`, borderRadius: 10 }}
              />
              <div style={{ marginTop: 8 }}>
                <Btn tone="ghost" onClick={shareToCompany} disabled={busy || !share.trim()}>
                  {intake.company_shared_at ? "修正して送り直す" : "担当者に共有する"}
                </Btn>
              </div>
            </>
          )}
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: msg.ok ? brand.tealDark : "#B02A2A" }}>{msg.text}</div>}
    </div>
  );
}
