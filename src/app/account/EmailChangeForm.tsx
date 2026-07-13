"use client";

import { useState } from "react";
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

export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (newEmail !== confirmEmail) {
      setErr("確認用のメールアドレスが一致しません。");
      return;
    }
    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setErr("現在のメールアドレスと同じです。");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/login` }
    );
    setBusy(false);
    if (error) {
      setErr("変更手続きを開始できませんでした: " + error.message);
      return;
    }
    setSent(true);
  };

  return (
    <Card>
      <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>メールアドレスの変更</h3>
      <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 14px" }}>
        現在のメールアドレス: <strong style={{ color: brand.ink }}>{currentEmail}</strong>
      </p>
      {sent ? (
        <div
          style={{
            fontSize: 13,
            color: brand.tealDark,
            background: "#E2F3F1",
            borderRadius: 10,
            padding: "12px 14px",
            lineHeight: 1.8,
          }}
        >
          確認メールを送信しました。
          <strong>現在のメールアドレスと新しいメールアドレスの両方</strong>
          に確認メールが届きます(設定により新しいアドレスのみの場合もあります)。届いたメールのリンクをすべてクリックすると変更が完了します。完了後は
          <strong>新しいメールアドレス</strong>でログインしてください。
        </div>
      ) : (
        <form onSubmit={submit}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            新しいメールアドレス
          </label>
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={{ ...input, marginBottom: 12 }}
          />
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            新しいメールアドレス(確認のためもう一度)
          </label>
          <input
            type="email"
            required
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            style={{ ...input, marginBottom: 12 }}
          />
          {err && (
            <div
              style={{
                fontSize: 13,
                color: "#B02A2A",
                background: "#FDF0F0",
                border: "1px solid #F3CBCB",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 12,
                lineHeight: 1.7,
              }}
            >
              {err}
            </div>
          )}
          <Btn type="submit" disabled={busy}>
            {busy ? "送信中…" : "確認メールを送信する"}
          </Btn>
          <p style={{ fontSize: 12, color: "#8A9694", marginTop: 10, lineHeight: 1.7 }}>
            確認メールのリンクをクリックするまで、メールアドレスは変更されません。
          </p>
        </form>
      )}
    </Card>
  );
}
