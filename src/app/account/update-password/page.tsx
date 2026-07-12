"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
      setErr(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  };

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
