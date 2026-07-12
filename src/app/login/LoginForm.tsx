"use client";

import { useState } from "react";
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
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErr("メールアドレスまたはパスワードが正しくありません。");
      return;
    }
    router.push(next);
    router.refresh();
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
        {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 8 }}>{err}</div>}
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
