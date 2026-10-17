"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { postJson } from "@/lib/api-client";
import { Badge, Btn, Card } from "@/components/ui";
import { LoadingCard } from "@/components/LoadingCard";
import { brand } from "@/lib/brand";
import { CRISIS_CONTACTS, CRISIS_MESSAGE, INTAKE_FIRST_MESSAGE, INTAKE_MAX_CHARS, detectCrisis, type IntakeMessage, type IntakeStatus, type RiskLevel } from "@/lib/intake";

type Intake = { id: string; status: IntakeStatus; messages: IntakeMessage[]; risk_level: RiskLevel; reply: string | null; reply_sent_at: string | null };

// 紹介用デモの台本(AIを使わず、決まった質問を順に出す)
export type IntakeDemo = { steps: { reply: string; sample: string }[]; doctorReply: string; doctorHref: string };

// 面接指導の事前ヒアリング(本人の画面)。AI が状況を聞き取り、終わると医師に要約が届く
export function IntakeChat({ requestId, demo }: { requestId: string; demo?: IntakeDemo }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [agree, setAgree] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "finish" | "start">("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (demo) {
      setAvailable(true);
      return;
    }
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`/api/intake/status?requestId=${encodeURIComponent(requestId)}`, {
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.error ?? "読み込めませんでした");
      setAvailable(false);
      return;
    }
    if (json.intake) {
      const { data } = await supabase
        .from("interview_intakes")
        .select("id, status, messages, risk_level, reply, reply_sent_at")
        .eq("id", json.intake.id)
        .maybeSingle();
      setIntake((data as Intake | null) ?? null);
    }
    setAvailable(Boolean(json.available) || Boolean(json.intake));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [intake?.messages.length, busy]);

  const start = async () => {
    if (demo) {
      setIntake({
        id: "demo",
        status: "in_progress",
        messages: [{ role: "assistant", content: INTAKE_FIRST_MESSAGE, at: new Date().toISOString() }],
        risk_level: "none",
        reply: null,
        reply_sent_at: null,
      });
      return;
    }
    setBusy("start");
    setErr(null);
    const { ok, json } = await postJson("/api/intake/start", { requestId, consent: true });
    setBusy("");
    if (!ok) return setErr(json.error ?? "開始できませんでした");
    load();
  };

  const send = async () => {
    if (!intake || !text.trim()) return;
    const mine: IntakeMessage = { role: "user", content: text.trim(), at: new Date().toISOString() };
    setIntake({ ...intake, messages: [...intake.messages, mine] });
    const sent = text;
    setText("");
    setBusy("send");
    setErr(null);
    if (demo) {
      // デモ: 台本の次の質問を少し待ってから出す
      const idx = intake.messages.filter((m) => m.role === "user").length;
      const crisis = detectCrisis(sent);
      const last = idx >= demo.steps.length - 1;
      const reply = crisis ? CRISIS_MESSAGE : (demo.steps[idx]?.reply ?? demo.steps[demo.steps.length - 1].reply);
      setTimeout(() => {
        setBusy("");
        setIntake((p) =>
          p
            ? { ...p, risk_level: crisis ? "high" : p.risk_level, messages: [...p.messages, { role: "assistant", content: reply, at: new Date().toISOString() }] }
            : p
        );
        if (crisis || last) setDone(true);
      }, 900);
      return;
    }
    const { ok, json } = await postJson<{ reply: string; done: boolean; risk_level: RiskLevel }>("/api/intake/message", {
      intakeId: intake.id,
      text: sent,
    });
    setBusy("");
    if (!ok) {
      setIntake((p) => (p ? { ...p, messages: p.messages.slice(0, -1) } : p));
      setText(sent);
      return setErr(json.error ?? "送信できませんでした");
    }
    setIntake((p) =>
      p ? { ...p, risk_level: json.risk_level, messages: [...p.messages, { role: "assistant", content: json.reply, at: new Date().toISOString() }] } : p
    );
    if (json.done) setDone(true);
  };

  const finish = async () => {
    if (!intake) return;
    if (demo) {
      setIntake({ ...intake, status: "completed", reply: demo.doctorReply, reply_sent_at: new Date().toISOString() });
      return;
    }
    setBusy("finish");
    setErr(null);
    const { ok, json } = await postJson("/api/intake/finish", { intakeId: intake.id });
    setBusy("");
    if (!ok) return setErr(json.error ?? "送信できませんでした");
    load();
  };

  if (available === null) return <LoadingCard style={{ maxWidth: 720, margin: "0 auto" }} />;

  const box = { maxWidth: 720, margin: "0 auto", display: "grid", gap: 14 } as const;
  const crisis = intake?.risk_level === "high" && (
    <Card style={{ borderColor: "#E9B3B3", background: "#FFF5F5" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#B02A2A" }}>ひとりで抱えずに、いますぐ相談してください</div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 14, lineHeight: 1.9 }}>
        {CRISIS_CONTACTS.map((c) => (
          <li key={c.tel}>
            {c.name}: <a href={`tel:${c.tel.replace(/-/g, "")}`} style={{ color: "#B02A2A", fontWeight: 700 }}>{c.tel}</a>
          </li>
        ))}
        <li>命の危険を感じるとき: <a href="tel:119" style={{ color: "#B02A2A", fontWeight: 700 }}>119</a></li>
      </ul>
      <p style={{ fontSize: 13, color: "#5B6B6A", margin: "8px 0 0" }}>医師(実施者)にもお知らせしています。</p>
    </Card>
  );

  if (!available && !intake) {
    return (
      <div style={box}>
        <Card>
          <p style={{ fontSize: 14, margin: 0 }}>{err ?? "この申出では事前ヒアリングはご利用いただけません。"}</p>
          <Link href="/my" style={{ display: "inline-block", marginTop: 12, color: brand.tealDark, fontWeight: 700 }}>マイページへ戻る</Link>
        </Card>
      </div>
    );
  }

  // 開始前: 説明と同意
  if (!intake) {
    return (
      <div style={box}>
        <Card>
          <Badge tone="orange">任意・約10分</Badge>
          <h1 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 8px" }}>面接指導の事前ヒアリング</h1>
          <p style={{ fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "0 0 10px" }}>
            医師との面談の前に、AIがいまの状況を少しずつ伺います。お話しいただいた内容は医師が事前に確認するので、面談の時間を相談に使えます。
            受けなくても、面接指導の申出はそのまま有効です。
          </p>
          <ul style={{ fontSize: 13, color: "#44534F", lineHeight: 1.9, margin: "0 0 12px", paddingLeft: 20 }}>
            <li>聞き取りは、AI(Anthropic社の Claude)が行います。AIは医師ではなく、診断や治療の指示はしません。</li>
            <li>内容を見られるのは、あなたと実施者(産業医)だけです。会社の担当者や上司には共有されません。</li>
            <li>AIの提供元に送った内容は、AIの学習には使われません(提供元の規約による)。</li>
            <li>答えにくい質問には答えなくて大丈夫です。途中でやめることもできます。</li>
            <li>終わると、医師が内容を確認し、面談の日程と医師からの返信をお送りします。</li>
          </ul>
          <label style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.7, alignItems: "flex-start" }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
            <span>上の内容を理解し、AIによる事前ヒアリングを受けることに同意します。</span>
          </label>
          {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 8 }}>{err}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <Btn onClick={start} disabled={!agree || busy !== ""}>{busy === "start" ? "準備しています…" : "事前ヒアリングを始める"}</Btn>
            <Link href="/my"><Btn tone="ghost">今回は受けない</Btn></Link>
          </div>
        </Card>
      </div>
    );
  }

  const finished = intake.status !== "in_progress";
  return (
    <div style={box}>
      <Card>
        <h1 style={{ fontSize: 18, color: brand.ink, margin: "0 0 4px" }}>面接指導の事前ヒアリング</h1>
        <p style={{ fontSize: 12, color: "#7A8886", margin: 0 }}>AIによる聞き取りです(医師ではありません)。内容は実施者(産業医)だけが確認します。</p>
      </Card>
      {crisis}
      <Card>
        <div style={{ display: "grid", gap: 10 }}>
          {intake.messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div
                style={{
                  maxWidth: "85%",
                  whiteSpace: "pre-wrap",
                  fontSize: 14,
                  lineHeight: 1.8,
                  padding: "8px 12px",
                  borderRadius: 12,
                  background: m.role === "user" ? brand.teal : "#F1F5F4",
                  color: m.role === "user" ? "#fff" : brand.ink,
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy === "send" && <div style={{ fontSize: 13, color: "#7A8886" }}>入力を確認しています…</div>}
          <div ref={bottom} />
        </div>

        {!finished && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${brand.line}`, paddingTop: 12 }}>
            {!done && (
              <>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, INTAKE_MAX_CHARS))}
                  rows={3}
                  placeholder="ここに入力してください"
                  disabled={busy !== ""}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, border: `1px solid ${brand.line}`, borderRadius: 10 }}
                />
                <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Btn onClick={send} disabled={busy !== "" || !text.trim()}>送信</Btn>
                  {demo && (
                    <Btn
                      tone="ghost"
                      disabled={busy !== ""}
                      onClick={() => setText(demo.steps[intake.messages.filter((m) => m.role === "user").length]?.sample ?? "")}
                    >
                      (デモ)答えの例を入れる
                    </Btn>
                  )}
                  <button
                    onClick={finish}
                    disabled={busy !== "" || !intake.messages.some((m) => m.role === "user")}
                    style={{ background: "none", border: 0, color: brand.tealDark, fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                  >
                    ここで終えて医師に送る
                  </button>
                </div>
              </>
            )}
            {done && (
              <div>
                <p style={{ fontSize: 14, color: brand.ink, margin: "0 0 10px" }}>聞き取りはここまでです。下のボタンで、医師に内容を送ってください。</p>
                <Btn onClick={finish} disabled={busy !== ""}>{busy === "finish" ? "医師に送っています…" : "医師に送る"}</Btn>
              </div>
            )}
            {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 8 }}>{err}</div>}
          </div>
        )}
      </Card>

      {finished && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, color: brand.tealDark }}>医師に送りました</div>
          <p style={{ fontSize: 14, color: "#44534F", lineHeight: 1.8, margin: "6px 0 0" }}>
            ご協力ありがとうございました。医師が内容を確認し、面談の日程と医師からの返信をお送りします。返信が届くとメールでお知らせします。
          </p>
          {demo && intake.reply && (
            <p style={{ fontSize: 12, color: "#8A6B2E", margin: "8px 0 0" }}>
              (デモ)実際には、医師が要約を確認し、返信の下書きを直してから送ります。下は返信の例です。
            </p>
          )}
          {intake.reply && (
            <div style={{ marginTop: 12, background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink }}>医師からの返信{intake.reply_sent_at && `(${new Date(intake.reply_sent_at).toLocaleDateString("ja-JP")})`}</div>
              <div style={{ fontSize: 14, color: "#2C3B39", lineHeight: 1.9, whiteSpace: "pre-wrap", marginTop: 6 }}>{intake.reply}</div>
            </div>
          )}
          {demo ? (
            <Link href={demo.doctorHref} style={{ display: "inline-block", marginTop: 12, color: brand.tealDark, fontWeight: 700 }}>
              医師(産業医)の画面のサンプルを見る →
            </Link>
          ) : (
            <Link href="/my" style={{ display: "inline-block", marginTop: 12, color: brand.tealDark, fontWeight: 700 }}>マイページへ戻る</Link>
          )}
        </Card>
      )}
    </div>
  );
}
