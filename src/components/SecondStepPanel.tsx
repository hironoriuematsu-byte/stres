"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Btn, Card } from "@/components/ui";
import { LoadingCard } from "@/components/LoadingCard";
import { brand } from "@/lib/brand";
import { isCode, normalizeCode } from "@/lib/second-step";

type Settings = {
  applied: boolean; // SQL 0035 が実行済みか
  ready: boolean; // このアプリが確認コードを送れるか
  office: boolean;
  staff: boolean;
  tested: boolean; // このログインで、確認コードを受け取って入力できたか
  email: string;
  kenko: { url: string; ready: boolean; applied: boolean } | null;
  counts: { office: number; staff: number };
};

const OFF_SQL = "select public.second_step_enable('office', false);\nselect public.second_step_enable('staff', false);";

// 二段階認証(ログインの確認コード)の設定。事務所だけが使う。
// 有効にする前に、自分のメールで確認コードを受け取れることを必ず試す(届かないまま有効にして、全員が入れなくなるのを防ぐ)
export function SecondStepPanel() {
  const [s, setS] = useState<Settings | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/second-step?settings=1", { cache: "no-store" });
    if (!res.ok) return setLoadErr("設定を読み込めませんでした。画面を再読み込みしてください。");
    setS((await res.json()) as Settings);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/second-step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: j.error };
  };
  const run = async (key: string, body: Record<string, unknown>, done: string) => {
    setBusy(key);
    setErr(null);
    setMsg(null);
    const r = await post(body);
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? "処理できませんでした");
      return false;
    }
    setMsg(done);
    await load();
    return true;
  };

  if (loadErr) return <Card><p style={{ margin: 0, color: "#B02A2A", fontSize: 14 }}>{loadErr}</p></Card>;
  if (!s) return <LoadingCard />;

  const kenkoOk = !s.kenko || (s.kenko.ready && s.kenko.applied);
  const canEnable = s.applied && s.ready && s.tested;
  const mark = (ok: boolean) => <span style={{ color: ok ? brand.tealDark : "#B02A2A", fontWeight: 700 }}>{ok ? "✅ 準備できています" : "❌ 準備がまだです"}</span>;

  const toggle = async (group: "office" | "staff", on: boolean) => {
    const label = group === "office" ? "事務所" : "会社の担当者・実施事務従事者";
    if (on) {
      const lines = [
        `「${label}」の二段階認証を有効にします。`,
        group === "office"
          ? "次のログインから、事務所の方にメールの確認コードが求められます(「この端末を30日間覚える」にチェックした端末では、30日間は求められません)。"
          : `次のログインから、会社の担当者・実施事務従事者の方(${s.counts.staff}名)にメールの確認コードが求められます。先にお知らせを済ませてから、有効にしてください。`,
        !kenkoOk ? "\n⚠️ 健康管理Webの準備ができていません。このまま有効にすると、対象の方は健康管理Webに入れなくなります。" : "",
        "\nよろしいですか？",
      ];
      if (!window.confirm(lines.filter(Boolean).join("\n"))) return;
    } else if (!window.confirm(`「${label}」の二段階認証をオフにします。パスワードだけでログインできる状態に戻ります。よろしいですか？`)) {
      return;
    }
    await run(`${group}`, { action: "enable", group, on }, on ? `「${label}」の二段階認証を有効にしました。` : `「${label}」の二段階認証をオフにしました。`);
  };

  const row: React.CSSProperties = { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px 0", borderTop: `1px solid ${brand.line}` };
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <Badge>二段階認証</Badge>
        <h2 style={{ fontSize: 18, color: brand.ink, margin: "10px 0 6px" }}>ログインの確認コード(メール)</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: 0 }}>
          パスワードに加えて、メールに届く6けたの確認コードを入力しないと、事務所・担当者の画面に入れないようにします。
          「この端末を30日間覚える」にチェックした端末では、30日間は確認コードが求められません。
          ストレスチェックWebと健康管理Webの両方に効きます。従業員の方(メールのない方を含む)は対象外です。
        </p>
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, color: brand.tealDark, margin: "0 0 4px" }}>1. 準備の状況</h3>
        <div style={{ ...row, borderTop: 0 }}>
          <span style={{ flex: "1 1 240px", fontSize: 14 }}>データベースの準備(SQL 0035)</span>
          {mark(s.applied)}
        </div>
        <div style={row}>
          <span style={{ flex: "1 1 240px", fontSize: 14 }}>ストレスチェックWeb: 確認コードのメールを送る準備</span>
          {mark(s.ready)}
        </div>
        <div style={row}>
          <span style={{ flex: "1 1 240px", fontSize: 14 }}>健康管理Web: 確認コードのメールを送る準備</span>
          {s.kenko ? mark(s.kenko.ready && s.kenko.applied) : <span style={{ color: "#8A6D00", fontWeight: 700 }}>確認できません(健康管理WebのURLが未設定)</span>}
        </div>
        {(!s.applied || !s.ready || (s.kenko && !kenkoOk)) && (
          <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8, margin: "8px 0 0" }}>
            {!s.applied && "SQL 0035 を Supabase の SQL Editor で実行してください。"}
            {s.applied && !s.ready && "Vercel(ストレスチェックWeb)の環境変数 SUPABASE_SERVICE_ROLE_KEY・RESEND_API_KEY・SENDER_EMAIL を確かめてください。"}
            {s.kenko && !kenkoOk && " 健康管理Webは、Vercel(健康管理Web)の環境変数 SUPABASE_SERVICE_ROLE_KEY・RESEND_API_KEY・SENDER_EMAIL を設定し、再デプロイしてください。"}
          </p>
        )}
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, color: brand.tealDark, margin: "0 0 4px" }}>2. 自分のメールで試す</h3>
        <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 10px" }}>
          有効にする前に、確認コードのメールが実際に届くことを確かめます({s.email} あてに送ります)。
        </p>
        {s.tested ? (
          <p style={{ margin: 0, fontSize: 14, color: brand.tealDark, fontWeight: 700 }}>✅ このログインで、確認コードを受け取って入力できました。</p>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Btn tone={sent ? "ghost" : "teal"} disabled={busy !== null || !s.applied || !s.ready} onClick={async () => { if (await run("test-send", { action: "test-send" }, "確認コードを送りました。メールに届いた6けたの数字を入力してください。")) setSent(true); }}>
              {busy === "test-send" ? "送っています…" : sent ? "もう一度送る" : "確認コードを自分に送る"}
            </Btn>
            {sent && (
              <>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  placeholder="123456"
                  aria-label="確認コード"
                  style={{ width: 130, padding: "10px 12px", fontSize: 18, letterSpacing: "0.2em", textAlign: "center", border: `1px solid ${brand.line}`, borderRadius: 10 }}
                />
                <Btn
                  disabled={busy !== null || !isCode(normalizeCode(code))}
                  onClick={async () => { if (await run("test-verify", { action: "test-verify", code: normalizeCode(code) }, "確認できました。下のスイッチで有効にできます。")) setCode(""); }}
                >
                  {busy === "test-verify" ? "確認しています…" : "確認する"}
                </Btn>
              </>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, color: brand.tealDark, margin: "0 0 4px" }}>3. 有効にする</h3>
        {(["office", "staff"] as const).map((g, i) => {
          const on = s[g];
          return (
            <div key={g} style={i === 0 ? { ...row, borderTop: 0 } : row}>
              <div style={{ flex: "1 1 260px" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: brand.ink }}>
                  {g === "office" ? "事務所" : "会社の担当者・実施事務従事者"}
                  <span style={{ fontWeight: 400, color: "#5B6B6A", marginLeft: 8, fontSize: 13 }}>{s.counts[g]}名</span>
                </div>
                <div style={{ fontSize: 12.5, color: "#5B6B6A", lineHeight: 1.7 }}>
                  {g === "office"
                    ? "まずこちらを有効にして、数日使ってみることをおすすめします。"
                    : "健康管理Webの担当を兼ねる従業員の方も含みます。事前にお知らせしてから有効にしてください。"}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: on ? brand.tealDark : "#5B6B6A" }}>{on ? "🔒 有効" : "オフ"}</span>
              {on ? (
                <Btn tone="ghost" disabled={busy !== null} onClick={() => toggle(g, false)}>
                  {busy === g ? "切り替えています…" : "オフにする"}
                </Btn>
              ) : (
                <Btn tone="orange" disabled={busy !== null || !canEnable} onClick={() => toggle(g, true)}>
                  {busy === g ? "切り替えています…" : "有効にする"}
                </Btn>
              )}
            </div>
          );
        })}
        {!canEnable && <p style={{ fontSize: 13, color: "#5B6B6A", margin: "8px 0 0" }}>有効にするには、上の「準備の状況」がそろい、「自分のメールで試す」が済んでいる必要があります。</p>}
        {err && <p role="alert" style={{ color: "#B02A2A", fontSize: 13.5, margin: "10px 0 0", lineHeight: 1.7 }}>{err}</p>}
        {msg && <p role="status" style={{ color: brand.tealDark, fontSize: 13.5, margin: "10px 0 0", lineHeight: 1.7 }}>{msg}</p>}
      </Card>

      <Card>
        <h3 style={{ fontSize: 15, color: brand.tealDark, margin: "0 0 4px" }}>困ったとき</h3>
        <ul style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.9, margin: 0, paddingLeft: 20 }}>
          <li>端末をなくした・人に譲ったときは、パスワードを変更してください。覚えた端末がすべて取り消され、次のログインで確認コードが求められます。</li>
          <li>確認コードは10分間有効で、5回まちがえると使えなくなります(送り直せます)。送り直しは1時間に6回までです。</li>
          <li>
            メールが届かず誰も入れなくなったときは、Supabase の SQL Editor で次を実行すると、すぐに止められます。
            <pre style={{ background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 8, padding: "8px 10px", margin: "6px 0 0", fontSize: 12, overflowX: "auto" }}>{OFF_SQL}</pre>
          </li>
        </ul>
      </Card>
    </div>
  );
}
