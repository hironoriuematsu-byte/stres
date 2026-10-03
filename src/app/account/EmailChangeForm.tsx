"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { EmailTypoHint } from "@/components/EmailTypoHint";

const input = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px 12px",
  fontSize: 15,
  border: `1px solid ${brand.line}`,
  borderRadius: 10,
};

// Supabase からの英語のエラーを、利用者が次に何をすればよいか分かる日本語にする
function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) {
    return (
      "新しいメールアドレスは、すでに別のアカウントで登録されているため使えません。" +
      "そのアドレスで登録した覚えがある場合は、いったんログアウトして、そのアドレスとパスワードでログインしてください" +
      "(パスワードが不明なときはログイン画面の「パスワードを忘れた方」から再設定できます)。" +
      "2つのアカウントを1つにまとめたい場合は、会社のストレスチェック担当者または実施者(産業医事務所)にご連絡ください。"
    );
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "短時間に確認メールを送りすぎたため、しばらく送信できません。数分おいてからもう一度お試しください。";
  }
  if (m.includes("invalid") && m.includes("email")) {
    return "メールアドレスの形式が正しくありません。入力内容をご確認ください。";
  }
  if (m.includes("not authenticated") || m.includes("jwt") || m.includes("session")) {
    return "ログインの有効期限が切れています。ログインし直してから、もう一度お試しください。";
  }
  return "変更手続きを開始できませんでした: " + message;
}

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
      setErr(translateError(error.message));
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
          <div style={{ marginTop: -8, marginBottom: 12 }}>
            <EmailTypoHint email={newEmail} onFix={setNewEmail} />
          </div>
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
