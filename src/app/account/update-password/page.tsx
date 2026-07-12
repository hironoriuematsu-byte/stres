"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "none">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 招待/再設定リンクの形式差を吸収してセッションを確立する。
  // 1) すでにセッションがある(PKCE/token_hashをコールバックで処理済み)
  // 2) URLの#にaccess_tokenが載っている(implicitフロー) → setSessionで取り込む
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setReady("ok");
        return;
      }
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error) {
          window.history.replaceState(null, "", window.location.pathname);
          setReady("ok");
          return;
        }
      }
      setReady("none");
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setErr("確認用パスワードが一致しません。");
      return;
    }
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setErr(
        error.message.includes("session")
          ? "ログインセッションが確認できませんでした。お手数ですが、パスワード再設定からやり直してください。"
          : error.message
      );
      return;
    }
    router.push("/");
    router.refresh();
  };

  if (ready === "checking") {
    return <Card style={{ maxWidth: 440, margin: "0 auto" }}>確認中…</Card>;
  }

  if (ready === "none") {
    return (
      <Card style={{ maxWidth: 440, margin: "0 auto" }}>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 8px" }}>リンクが無効か、期限切れです</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 14px" }}>
          招待・再設定リンクは一定時間で無効になります(また、一度使ったリンクは再利用できません)。お手数ですが、以下からパスワードの再設定を行ってください。
        </p>
        <Link href="/reset-password">
          <Btn>パスワード再設定へ</Btn>
        </Link>
      </Card>
    );
  }

  const input = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "10px 12px",
    fontSize: 15,
    border: `1px solid ${brand.line}`,
    borderRadius: 10,
  };

  return (
    <Card style={{ maxWidth: 440, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 6px" }}>パスワードの設定</h2>
      <p style={{ fontSize: 13, color: "#5B6B6A", margin: "0 0 14px", lineHeight: 1.7 }}>
        新しいパスワード(8文字以上)を設定してください。設定後、そのままご利用いただけます。
      </p>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            新しいパスワード
          </label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            新しいパスワード(確認)
          </label>
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} style={input} />
        </div>
        {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 8 }}>{err}</div>}
        <div style={{ marginTop: 16 }}>
          <Btn type="submit" disabled={loading}>
            {loading ? "設定中…" : "パスワードを設定する"}
          </Btn>
        </div>
      </form>
    </Card>
  );
}
