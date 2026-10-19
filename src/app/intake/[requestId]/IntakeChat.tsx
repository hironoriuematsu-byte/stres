"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { postJson } from "@/lib/api-client";
import { Badge, Btn, Card } from "@/components/ui";
import { LoadingCard } from "@/components/LoadingCard";
import { VoiceInputButton, useVoiceSupport } from "@/components/VoiceInputButton";
import { brand } from "@/lib/brand";
import {
  CRISIS_CONTACTS,
  CRISIS_MESSAGE,
  INTAKE_FIRST_MESSAGE,
  INTAKE_MAX_CHARS,
  SHARE_OPTIONS,
  detectCrisis,
  type IntakeMessage,
  type IntakeStatus,
  type RiskLevel,
  type ShareKey,
} from "@/lib/intake";

type Intake = {
  id: string;
  status: IntakeStatus;
  messages: IntakeMessage[];
  risk_level: RiskLevel;
  progress: number;
  reply: string | null;
  reply_sent_at: string | null;
};

// 紹介用デモの台本(AIを使わず、決まった質問を順に出す)
export type IntakeDemo = { steps: { reply: string; sample: string }[]; doctorReply: string; doctorHref: string };

// 進み具合のバー(value が null のときは「処理中」の動くバー)
function ProgressBar({ value, label }: { value: number | null; label: string }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#5B6B6A", marginBottom: 4 }}>
        <span>{label}</span>
        {value !== null && <span>{value}%</span>}
      </div>
      <div style={{ height: 8, background: "#E6EEED", borderRadius: 999, overflow: "hidden", position: "relative" }}>
        {value !== null ? (
          <div style={{ width: `${value}%`, height: "100%", background: brand.teal, borderRadius: 999, transition: "width .6s ease" }} />
        ) : (
          <div className="intake-indeterminate" style={{ position: "absolute", height: "100%", width: "35%", background: brand.teal, borderRadius: 999 }} />
        )}
      </div>
    </div>
  );
}

// 面接指導の事前問診(本人の画面)。AI が状況を詳しく聞き取り、終わると医師に要約が届く
export function IntakeChat({ requestId, demo }: { requestId: string; demo?: IntakeDemo }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [agree, setAgree] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "send" | "finish" | "start">("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [shareKeys, setShareKeys] = useState<ShareKey[]>([]);
  const [shareNote, setShareNote] = useState("");
  const [sendPct, setSendPct] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  const { desktopVoice, touch } = useVoiceSupport();

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
        .select("id, status, messages, risk_level, progress, reply, reply_sent_at")
        .eq("id", json.intake.id)
        .maybeSingle();
      const it = (data as Intake | null) ?? null;
      setIntake(it);
      // 前回、聞き取りの最後まで進んでいた(AIが終わりを告げていた)ら、共有範囲の選択から再開する
      if (it && it.status === "in_progress" && it.progress >= 100) setDone(true);
    }
    setAvailable(Boolean(json.available) || Boolean(json.intake));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [intake?.messages.length, busy, done]);

  const start = async () => {
    if (demo) {
      setIntake({
        id: "demo",
        status: "in_progress",
        messages: [{ role: "assistant", content: INTAKE_FIRST_MESSAGE, at: new Date().toISOString() }],
        risk_level: "none",
        progress: 5,
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

  const decline = async () => {
    if (
      !window.confirm(
        "事前問診に回答しないと、面談で状況を一から伺うため、面談の時間が長くなります。\n本当に回答しませんか？(あとから回答することもできます)"
      )
    )
      return;
    if (demo) return (window.location.href = "/demo");
    await postJson("/api/intake/decline", { requestId });
    window.location.href = "/my";
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
            ? {
                ...p,
                risk_level: crisis ? "high" : p.risk_level,
                progress: crisis || last ? 100 : Math.round(((idx + 1) / demo.steps.length) * 100),
                messages: [...p.messages, { role: "assistant", content: reply, at: new Date().toISOString() }],
              }
            : p
        );
        if (crisis || last) setDone(true);
      }, 900);
      return;
    }
    const { ok, json } = await postJson<{ reply: string; done: boolean; risk_level: RiskLevel; progress: number }>("/api/intake/message", {
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
      p
        ? {
            ...p,
            risk_level: json.risk_level,
            progress: json.progress,
            messages: [...p.messages, { role: "assistant", content: json.reply, at: new Date().toISOString() }],
          }
        : p
    );
    if (json.done) setDone(true);
  };

  const finish = async () => {
    if (!intake) return;
    setBusy("finish");
    setErr(null);
    setSendPct(10);
    const timer = setInterval(() => setSendPct((p) => Math.min(90, p + 15)), 400);
    const share = { keys: shareKeys, note: shareNote };
    const res = demo ? { ok: true, json: {} as { error?: string } } : await postJson("/api/intake/finish", { intakeId: intake.id, share });
    if (demo) await new Promise((r) => setTimeout(r, 1500));
    clearInterval(timer);
    if (!res.ok) {
      setBusy("");
      setSendPct(0);
      return setErr(res.json.error ?? "送信できませんでした");
    }
    setSendPct(100);
    await new Promise((r) => setTimeout(r, 400));
    setBusy("");
    if (demo) {
      setIntake({ ...intake, status: "completed", reply: demo.doctorReply, reply_sent_at: new Date().toISOString() });
      return;
    }
    load();
  };

  if (available === null) return <LoadingCard style={{ maxWidth: 720, margin: "0 auto" }} />;

  const box = { maxWidth: 720, margin: "0 auto", display: "grid", gap: 14 } as const;
  const crisis = intake?.risk_level === "high" && (
    <Card style={{ borderColor: "#E9B3B3", background: "#FFF5F5" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#B02A2A" }}>ひとりで抱えずに、まずはこちらに電話で相談してください</div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 14, lineHeight: 1.9 }}>
        {CRISIS_CONTACTS.map((c) => (
          <li key={c.tel}>
            {c.name}:{" "}
            <a href={`tel:${c.tel.replace(/-/g, "")}`} style={{ color: "#B02A2A", fontWeight: 700 }}>
              {c.tel}
            </a>
          </li>
        ))}
      </ul>
      <p style={{ fontSize: 13, color: "#5B6B6A", margin: "8px 0 0", lineHeight: 1.7 }}>
        医師(実施者)にもお知らせしました。医師からも連絡します。
        <br />
        いますぐ命の危険が差し迫っているときは、最後の手段として{" "}
        <a href="tel:119" style={{ color: "#B02A2A", fontWeight: 700 }}>
          119番
        </a>{" "}
        に電話してください。
      </p>
    </Card>
  );

  if (!available && !intake) {
    return (
      <div style={box}>
        <Card>
          <p style={{ fontSize: 14, margin: 0 }}>{err ?? "この申出では事前問診はありません。"}</p>
          <Link href="/my" style={{ display: "inline-block", marginTop: 12, color: brand.tealDark, fontWeight: 700 }}>
            マイページへ戻る
          </Link>
        </Card>
      </div>
    );
  }

  // 開始前: 説明と同意
  if (!intake) {
    return (
      <div style={box}>
        <Card>
          <Badge tone="orange">面談の前に回答をお願いします(約15〜20分)</Badge>
          <h1 style={{ fontSize: 21, color: brand.ink, margin: "10px 0 8px" }}>面接指導の事前問診</h1>
          <p style={{ fontSize: 14.5, color: "#2C3B39", lineHeight: 1.9, margin: "0 0 10px" }}>
            医師との面談の前に、<strong>必ず事前問診にご回答ください</strong>。AIがいまの状況を詳しく伺い、医師が事前に内容を確認します。
            面談では状況の聞き取りを省き、<strong>解決策の相談に時間を使えます</strong>。
          </p>
          <ul style={{ fontSize: 13, color: "#44534F", lineHeight: 1.9, margin: "0 0 12px", paddingLeft: 20 }}>
            <li>質問に、できるだけ具体的にお答えください。<strong>音声入力</strong>を使うと、話すだけで詳しく入力できます。</li>
            <li>聞き取りはAI(Anthropic社の Claude)が行います。AIは医師ではなく、診断や治療の指示はしません。</li>
            <li>内容を見られるのは、あなたと実施者(産業医)だけです。会社の担当者に伝える範囲は、最後にあなたが選べます。</li>
            <li>AIの提供元に送った内容は、AIの学習には使われません(提供元の規約による)。</li>
            <li>中断しても、あとで続きから再開できます。</li>
          </ul>
          <label style={{ display: "flex", gap: 8, fontSize: 13.5, lineHeight: 1.7, alignItems: "flex-start" }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
            <span>上の内容を理解し、AIによる事前問診に回答することに同意します。</span>
          </label>
          {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 8 }}>{err}</div>}
          <div style={{ marginTop: 14 }}>
            <Btn tone="orange" onClick={start} disabled={!agree || busy !== ""} style={{ padding: "12px 28px", fontSize: 16 }}>
              {busy === "start" ? "準備しています…" : "事前問診に回答する"}
            </Btn>
          </div>
          <p style={{ fontSize: 11.5, color: "#8A9694", lineHeight: 1.7, margin: "14px 0 0" }}>
            事前問診への回答は、面接指導の申出の条件ではありません。回答できない事情がある場合は{" "}
            <button onClick={decline} style={{ background: "none", border: 0, padding: 0, color: "#8A9694", textDecoration: "underline", cursor: "pointer", fontSize: 11.5 }}>
              こちら
            </button>
            。
          </p>
        </Card>
      </div>
    );
  }

  const finished = intake.status !== "in_progress";
  const voiceHint = touch
    ? "🎤 スマートフォンは、キーボードのマイクのボタンを押すと、話すだけで入力できます。できるだけ詳しく話してください。"
    : desktopVoice
      ? "🎤「音声で入力」を押すと、話した内容がそのまま入力されます。できるだけ詳しく話してください。"
      : "🎤 音声入力も使えます(Windows:「Windowsキー + H」/ Mac:「fn(地球儀)キーを2回」)。できるだけ詳しく話してください。";

  return (
    <div style={box}>
      <style>{`@keyframes intake-move{0%{left:-35%}100%{left:100%}} .intake-indeterminate{animation:intake-move 1.2s ease-in-out infinite}`}</style>
      <Card>
        <h1 style={{ fontSize: 18, color: brand.ink, margin: "0 0 4px" }}>面接指導の事前問診</h1>
        <p style={{ fontSize: 12, color: "#7A8886", margin: "0 0 10px" }}>AIによる聞き取りです(医師ではありません)。内容は実施者(産業医)だけが確認します。</p>
        {!finished && <ProgressBar value={intake.progress || 5} label="問診の進み具合" />}
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
          {busy === "send" && <ProgressBar value={null} label="回答を確認しています…" />}
          <div ref={bottom} />
        </div>

        {!finished && !done && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${brand.line}`, paddingTop: 12 }}>
            {demo && (
              <div style={{ fontSize: 12, color: "#8A6B2E", background: "#FBF3E3", border: "1px solid #EFD9A8", borderRadius: 8, padding: "8px 10px", lineHeight: 1.7, marginBottom: 8 }}>
                (デモ)決まった順番の質問を出しているだけで、答えの内容は読み取りません。実際のAIは、答えに合わせて次の質問を変え、すでに伺ったことは繰り返しません。
              </div>
            )}
            <div style={{ fontSize: 12.5, color: brand.tealDark, background: "#F4FAF9", borderRadius: 8, padding: "8px 10px", lineHeight: 1.7, marginBottom: 8 }}>
              {voiceHint}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, INTAKE_MAX_CHARS))}
              rows={4}
              placeholder="ここに入力してください(音声入力もできます)"
              disabled={busy !== ""}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, lineHeight: 1.7, border: `1px solid ${brand.line}`, borderRadius: 10 }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Btn onClick={send} disabled={busy !== "" || !text.trim()} style={{ padding: "10px 24px" }}>
                送信
              </Btn>
              <VoiceInputButton onAppend={(chunk) => setText((p) => (p + chunk).slice(0, INTAKE_MAX_CHARS))} disabled={busy !== ""} />
              {demo && (
                <Btn
                  tone="ghost"
                  disabled={busy !== ""}
                  onClick={() => setText(demo.steps[intake.messages.filter((m) => m.role === "user").length]?.sample ?? "")}
                >
                  (デモ)答えの例を入れる
                </Btn>
              )}
            </div>
            {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 8 }}>{err}</div>}
          </div>
        )}
      </Card>

      {/* 聞き取りが終わったら: 会社の担当者に伝えてよい範囲を選んで、医師に送る */}
      {!finished && done && (
        <Card>
          <h2 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>最後に、会社の担当者に伝えてよい範囲を選んでください</h2>
          <p style={{ fontSize: 13, color: "#44534F", lineHeight: 1.8, margin: "0 0 10px" }}>
            面談の日程調整や、職場での配慮(業務量の調整など)の準備のために、会社のストレスチェック担当者(実施事務従事者:守秘義務があり、人事権のない方)に伝えてよい範囲です。
            医師が内容を確認してから伝えます。病名や症状の詳しい内容は伝えません。選ばなければ、面談の前には何も伝えません。
          </p>
          <div style={{ display: "grid", gap: 6 }}>
            {SHARE_OPTIONS.map((o) => (
              <label key={o.key} style={{ display: "flex", gap: 8, fontSize: 13.5, lineHeight: 1.6, alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={shareKeys.includes(o.key)}
                  onChange={(e) => setShareKeys((p) => (e.target.checked ? [...p, o.key] : p.filter((k) => k !== o.key)))}
                  style={{ marginTop: 3 }}
                  disabled={busy !== ""}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: brand.ink, margin: "10px 0 4px" }}>伝えてほしくないこと(任意)</label>
          <textarea
            value={shareNote}
            onChange={(e) => setShareNote(e.target.value.slice(0, 500))}
            rows={2}
            disabled={busy !== ""}
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 14, border: `1px solid ${brand.line}`, borderRadius: 10 }}
          />
          <div style={{ marginTop: 12 }}>
            {busy === "finish" ? (
              <ProgressBar value={sendPct} label="医師に送っています…" />
            ) : (
              <Btn tone="orange" onClick={finish} style={{ padding: "12px 28px", fontSize: 16 }}>
                医師に送る
              </Btn>
            )}
          </div>
          {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 8 }}>{err}</div>}
        </Card>
      )}

      {finished && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, color: brand.tealDark }}>医師に送りました</div>
          <p style={{ fontSize: 14, color: "#44534F", lineHeight: 1.8, margin: "6px 0 0" }}>
            ご回答ありがとうございました。医師が内容を確認し、面談の日程と医師からの返信をお送りします。返信が届くとメールでお知らせします。
          </p>
          {demo && intake.reply && (
            <p style={{ fontSize: 12, color: "#8A6B2E", margin: "8px 0 0" }}>
              (デモ)実際には、医師が要約を確認し、返信の下書きを直してから送ります。下は返信の例です。
            </p>
          )}
          {intake.reply && (
            <div style={{ marginTop: 12, background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink }}>
                医師からの返信{intake.reply_sent_at && `(${new Date(intake.reply_sent_at).toLocaleDateString("ja-JP")})`}
              </div>
              <div style={{ fontSize: 14, color: "#2C3B39", lineHeight: 1.9, whiteSpace: "pre-wrap", marginTop: 6 }}>{intake.reply}</div>
            </div>
          )}
          {demo ? (
            <Link href={demo.doctorHref} style={{ display: "inline-block", marginTop: 12, color: brand.tealDark, fontWeight: 700 }}>
              医師(産業医)の画面のサンプルを見る →
            </Link>
          ) : (
            <Link href="/my" style={{ display: "inline-block", marginTop: 12, color: brand.tealDark, fontWeight: 700 }}>
              マイページへ戻る
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
