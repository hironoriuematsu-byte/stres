"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

export function SignupForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/exam`,
      },
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setDone(true);
  };

  if (done) {
    return (
      <Card style={{ maxWidth: 440, margin: "0 auto" }}>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 10px" }}>確認メールを送信しました</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7 }}>
          {email} 宛に確認メールを送信しました。メール内のリンクをクリックしてアカウントを有効化してください。
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 440, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 14px" }}>アカウント作成(従業員の方)</h2>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            氏名
          </label>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="例: 山田 太郎"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              fontSize: 15,
              border: `1px solid ${brand.line}`,
              borderRadius: 10,
            }}
          />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            メールアドレス
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              fontSize: 15,
              border: `1px solid ${brand.line}`,
              borderRadius: 10,
            }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            パスワード(8文字以上)
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              fontSize: 15,
              border: `1px solid ${brand.line}`,
              borderRadius: 10,
            }}
          />
        </div>
        {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
          <Btn type="submit" disabled={loading}>
            {loading ? "作成中…" : "アカウントを作成する"}
          </Btn>
          <Link href="/login" style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
            すでにアカウントをお持ちの方
          </Link>
        </div>
      </form>
    </Card>
  );
}
