"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { isCode, normalizeCode } from "@/lib/second-step";

// 確認コードの入力。画面を開くと自動でメールを送り、6けたの数字を入れると元の行き先へ進む
export function VerifyForm({ next, email }: { next: string; email: string }) {
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [phase, setPhase] = useState<"sending" | "ready" | "checking" | "done">("sending");
  const [info, setInfo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0); // 送り直せるまでの秒数
  const started = useRef(false);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/second-step", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string; done?: boolean; sent?: boolean; already?: boolean; ok?: boolean; wait?: number; to?: string };
    return { status: res.status, ...j };
  };

  const send = useCallback(
    async (again: boolean) => {
      setErr(null);
      setInfo(null);
      if (!again) setPhase("sending");
      const r = await post({ action: "send" });
      if (r.done) {
        // 確認が不要、またはすでに済んでいる(覚えた端末など)
        setPhase("done");
        window.location.replace(next);
        return;
      }
      setPhase("ready");
      if (typeof r.wait === "number") setWait(r.wait);
      if (r.sent) setInfo(again && !r.already ? "確認コードを送り直しました。新しいメールの数字を入力してください。" : null);
      else setErr(r.error ?? "確認コードを送れませんでした。少し待ってから「コードを送り直す」を押してください。");
    },
    [next]
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    send(false);
  }, [send]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!isCode(c)) return setErr("確認コードは、メールに書かれた6けたの数字です。");
    setErr(null);
    setInfo(null);
    setPhase("checking");
    const r = await post({ action: "verify", code: c, remember });
    if (r.ok) {
      setPhase("done");
      window.location.replace(next);
      return;
    }
    setPhase("ready");
    setCode("");
    setErr(r.error ?? "確認できませんでした。もう一度お試しください。");
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.replace("/login");
  };

  const busy = phase === "sending" || phase === "checking" || phase === "done";
  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <Card>
        <Badge>ログインの確認</Badge>
        <h1 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 8px" }}>確認コードを入力してください</h1>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 16px" }}>
          {phase === "sending" ? (
            "確認コードをメールでお送りしています…"
          ) : (
            <>
              <strong style={{ color: brand.ink }}>{email}</strong> あてに、6けたの確認コードをお送りしました。メールに書かれた数字を入力してください(有効期限は10分です)。
            </>
          )}
        </p>
        <form onSubmit={submit}>
          <label htmlFor="ss-code" style={{ display: "block", fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 6 }}>
            確認コード(6けたの数字)
          </label>
          <input
            id="ss-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={12}
            autoFocus
            placeholder="123456"
            disabled={phase === "done"}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              fontSize: 24,
              letterSpacing: "0.3em",
              textAlign: "center",
              border: `1px solid ${brand.line}`,
              borderRadius: 10,
            }}
          />
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "14px 0 4px", fontSize: 14, color: brand.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
            <span>
              この端末を30日間覚える
              <span style={{ display: "block", fontSize: 12, color: "#5B6B6A", lineHeight: 1.6 }}>
                次からは、この端末では確認コードなしでログインできます。ほかの人と共用のパソコンでは、チェックを外してください。
              </span>
            </span>
          </label>
          {err && (
            <p role="alert" style={{ color: "#B02A2A", fontSize: 13.5, lineHeight: 1.7, margin: "10px 0 0" }}>
              {err}
            </p>
          )}
          {info && (
            <p role="status" style={{ color: brand.tealDark, fontSize: 13.5, lineHeight: 1.7, margin: "10px 0 0" }}>
              {info}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 16 }}>
            <Btn type="submit" disabled={busy}>
              {phase === "checking" ? "確認しています…" : phase === "done" ? "確認できました" : "確認する"}
            </Btn>
            <Btn tone="ghost" disabled={busy || wait > 0} onClick={() => send(true)}>
              {wait > 0 ? `コードを送り直す(${wait}秒後)` : "コードを送り直す"}
            </Btn>
          </div>
        </form>
        <div style={{ borderTop: `1px solid ${brand.line}`, marginTop: 18, paddingTop: 12, fontSize: 12.5, color: "#5B6B6A", lineHeight: 1.8 }}>
          <strong style={{ color: brand.ink }}>メールが届かないとき</strong>
          <br />
          迷惑メールのフォルダをご確認ください。1分たっても届かないときは「コードを送り直す」を押してください(新しいコードを送ると、前のコードは使えなくなります)。
          <br />
          <button type="button" onClick={signOut} style={{ background: "none", border: 0, padding: 0, marginTop: 6, color: brand.tealDark, textDecoration: "underline", cursor: "pointer", fontSize: 12.5 }}>
            ログアウトして、別のアカウントでログインする
          </button>
        </div>
      </Card>
    </div>
  );
}
