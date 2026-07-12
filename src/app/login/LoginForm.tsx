"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

const input = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px 12px",
  fontSize: 15,
  border: `1px solid ${brand.line}`,
  borderRadius: 10,
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);

  // 確認メール等のリンクがログイン画面に着地した場合(#access_token=... 形式)、
  // トークンを取り込んでそのままログイン状態にする
  useEffect(() => {
    (async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (!error) {
          window.history.replaceState(null, "", window.location.pathname);
          router.push(next);
          router.refresh();
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    setUnconfirmed(false);
    setResent(false);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("not confirmed")) {
        setUnconfirmed(true);
        setErr(
          "メールアドレスの確認が完了していません。登録時に届いた確認メールのリンクをクリックしてから、再度ログインしてください。"
        );
      } else if (msg.includes("invalid login credentials")) {
        setErr("メールアドレスまたはパスワードが正しくありません。");
      } else {
        setErr(`ログインに失敗しました: ${error.message}`);
      }
      return;
    }
    router.push(next);
    router.refresh();
  };

  const resend = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/exam` },
    });
    setLoading(false);
    if (error) {
      setErr(`再送に失敗しました: ${error.message}`);
      return;
    }
    setResent(true);
    setErr(null);
  };

  return (
    <Card style={{ maxWidth: 440, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 14px" }}>ログイン</h2>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            メールアドレス
          </label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            パスワード
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={input}
          />
        </div>
        {err && (
          <div
            style={{
              fontSize: 13,
              color: "#B02A2A",
              background: "#FDF0F0",
              border: "1px solid #F3CBCB",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 8,
              lineHeight: 1.7,
            }}
          >
            {err}
            {unconfirmed && (
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={resend}
                  disabled={loading}
                  style={{
                    background: "#fff",
                    border: `1px solid ${brand.teal}`,
                    color: brand.tealDark,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  確認メールを再送する
                </button>
              </div>
            )}
          </div>
        )}
        {resent && (
          <div
            style={{
              fontSize: 13,
              color: brand.tealDark,
              background: "#E2F3F1",
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 8,
              lineHeight: 1.7,
            }}
          >
            確認メールを再送しました。メール内のリンクをクリックしてから、再度ログインしてください(迷惑メールフォルダもご確認ください)。
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
          <Btn type="submit" disabled={loading}>
            {loading ? "ログイン中…" : "ログイン"}
          </Btn>
          <Link href="/reset-password" style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
            パスワードを忘れた方
          </Link>
        </div>
      </form>
    </Card>
  );
}
