"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/update-password`,
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
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 10px" }}>再設定メールを送信しました</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.7 }}>
          {email} 宛にパスワード再設定用のメールを送信しました。メール内のリンクから新しいパスワードを設定してください。
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 440, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 14px" }}>パスワード再設定</h2>
      <form onSubmit={submit}>
        <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
          登録済みメールアドレス
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
        {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 8 }}>{err}</div>}
        <div style={{ marginTop: 16 }}>
          <Btn type="submit" disabled={loading}>
            {loading ? "送信中…" : "再設定メールを送る"}
          </Btn>
        </div>
      </form>
    </Card>
  );
}
