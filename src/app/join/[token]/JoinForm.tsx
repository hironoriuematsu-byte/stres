"use client";

import { useState } from "react";
import Link from "next/link";
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

export function JoinForm({ token }: { token: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"form" | "sent" | "exists">("form");
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
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErr(body.error ?? "登録に失敗しました。");
      } else if (body.alreadyRegistered) {
        setState("exists");
      } else {
        setState("sent");
      }
    } catch {
      setErr("通信エラーが発生しました。時間をおいて再度お試しください。");
    }
    setLoading(false);
  };

  if (state === "sent") {
    return (
      <Card>
        <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 8px" }}>確認メールを送信しました</h3>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: 0 }}>
          {email} 宛に本人確認メールを送信しました。メール内のリンクをクリックすると登録が完了し、そのまま受検に進めます。メールが見当たらない場合は迷惑メールフォルダもご確認ください。
        </p>
      </Card>
    );
  }

  if (state === "exists") {
    return (
      <Card>
        <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 8px" }}>登録済みのメールアドレスです</h3>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 14px" }}>
          このメールアドレスはすでに登録されています。ログインして受検してください。パスワードを忘れた場合は再設定できます。
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/login?next=/exam">
            <Btn>ログイン</Btn>
          </Link>
          <Link href="/reset-password">
            <Btn tone="ghost">パスワード再設定</Btn>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 12px" }}>アカウント登録</h3>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            メールアドレス
          </label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
          <p style={{ fontSize: 12, color: "#8A6B2E", background: "#FBF3E3", border: "1px solid #EFD9A8", borderRadius: 8, padding: "8px 10px", margin: "6px 0 0", lineHeight: 1.7 }}>
            登録したメールアドレスはログインに必要です。忘れないようにメモ等に残してください。
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            パスワード(8文字以上)
          </label>
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            パスワード(確認)
          </label>
          <input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} style={input} />
        </div>
        {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 8 }}>{err}</div>}
        <div style={{ marginTop: 16 }}>
          <Btn type="submit" disabled={loading}>
            {loading ? "登録中…" : "登録して確認メールを受け取る"}
          </Btn>
        </div>
      </form>
      <p style={{ fontSize: 12, color: "#8A9694", lineHeight: 1.7, marginTop: 12 }}>
        すでにアカウントをお持ちの方は
        <Link href="/login?next=/exam" style={{ color: brand.tealDark, fontWeight: 700 }}>
          こちらからログイン
        </Link>
        してください。
      </p>
    </Card>
  );
}
