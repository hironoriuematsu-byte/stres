"use client";

import { useState } from "react";
import Link from "next/link";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { isValidPersonName } from "@/lib/name";
import { EmailTypoHint } from "@/components/EmailTypoHint";
import { birthTextError, parseBirthDateInput } from "@/lib/birth-date";
import { BirthDateInput } from "@/components/BirthDateInput";

const input = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px 12px",
  fontSize: 15,
  border: `1px solid ${brand.line}`,
  borderRadius: 10,
};

export function JoinForm({ token }: { token: string }) {
  // 氏名は登録時に必須にする(以前は受検時に入力する作りで、未設定のまま残る利用者がいたため)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // 生年月日は健康管理Webで健診結果・カルテと本人を突合するために使う(同姓同名の区別)
  const [birthText, setBirthText] = useState(""); // 直接入力(19850304 など)
  const birthDate = parseBirthDateInput(birthText) ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"form" | "sent" | "exists">("form");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPersonName(name)) {
      setErr("氏名を入力してください(空白だけの入力はできません)。");
      return;
    }
    const birthErr = birthTextError(birthText);
    if (birthErr) {
      setErr(birthErr);
      return;
    }
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
        body: JSON.stringify({ token, name, email, password, birthDate }),
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
        <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8, margin: "10px 0 0" }}>
          携帯電話会社のメール(docomo・au・softbank など)をお使いの場合、迷惑メール設定で届かないことがあります。
          「mestate.jp」からのメールを受信できるよう設定してから、ログイン画面の「パスワードを忘れた方」でメールを再送してください。
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
            氏名
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 山田 太郎"
            autoComplete="name"
            style={input}
          />
          <p style={{ fontSize: 12, color: "#8A9694", margin: "6px 0 0", lineHeight: 1.7 }}>
            結果票と実施者・実施事務従事者の画面に表示されます。会社に届け出ている氏名を入力してください。
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            生年月日
          </label>
          <BirthDateInput text={birthText} onChange={setBirthText} style={input} />
          <p style={{ fontSize: 12, color: "#8A9694", margin: "6px 0 0", lineHeight: 1.7 }}>
            健康診断の結果や面談の記録と本人を正しく結び付けるために使います(同姓同名の方の区別)。
          </p>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            メールアドレス
          </label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
          <EmailTypoHint email={email} onFix={setEmail} />
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
