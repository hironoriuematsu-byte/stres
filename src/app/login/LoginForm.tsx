"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { startNavigationProgress } from "@/lib/navigate";
import { idEmail, normalizeLoginId, normalizePasscode, validLoginId } from "@/lib/no-email";

const input = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px 12px",
  fontSize: 15,
  border: `1px solid ${brand.line}`,
  borderRadius: 10,
};

export function LoginForm({ idDomain }: { idDomain: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const timedOut = params.get("reason") === "timeout";
  // メール内リンク(招待・パスワード再設定)が無効・期限切れ・使用済みだったとき
  const badLink = params.get("error") === "link";
  // メールアドレスのない方は、担当者から受け取った紙のログインIDと合言葉でログインする(?mode=id で最初からこの表示)
  const [mode, setMode] = useState<"email" | "id">(params.get("mode") === "id" ? "id" : "email");
  const [loginId, setLoginId] = useState("");
  const [passcode, setPasscode] = useState("");
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
          startNavigationProgress();
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
    if (mode === "id") {
      const id = normalizeLoginId(loginId);
      if (!validLoginId(id)) {
        setLoading(false);
        return setErr("ログインIDは数字8けたです。紙に書かれた番号をもう一度ご確認ください。");
      }
      const { error } = await supabase.auth.signInWithPassword({ email: idEmail(id, idDomain), password: normalizePasscode(passcode) });
      setLoading(false);
      if (error) {
        return setErr(
          error.message.toLowerCase().includes("invalid login credentials")
            ? "ログインIDまたは合言葉が正しくありません。紙をもう一度ご確認ください。分からないときは、会社のストレスチェック担当者にお尋ねください。"
            : `ログインに失敗しました: ${error.message}`
        );
      }
      startNavigationProgress();
      // IDの方は受検が目的なので、行き先の指定がなければ受検の画面へ
      router.push(next === "/" ? "/exam" : next);
      router.refresh();
      return;
    }
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
    startNavigationProgress();
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
      <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 14px" }}>{mode === "id" ? "ログインIDでログイン" : "ログイン"}</h2>
      {timedOut && (
        <div
          style={{
            fontSize: 13,
            color: "#8A6B2E",
            background: "#FBF3E3",
            border: "1px solid #EFD9A8",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 12,
            lineHeight: 1.7,
          }}
        >
          一定時間操作がなかったため、安全のため自動的にログアウトしました。再度ログインしてください。
        </div>
      )}
      {badLink && (
        <div
          style={{
            fontSize: 13,
            color: "#8A6B2E",
            background: "#FBF3E3",
            border: "1px solid #EFD9A8",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 12,
            lineHeight: 1.7,
          }}
        >
          メールのリンクが無効か、期限切れ(24時間)または使用済みです。パスワードをまだ設定していない方は、下の「パスワードを忘れた方」から再設定メールを申し込み、届いたメールのボタンを1時間以内に押してください。
        </div>
      )}
      <form onSubmit={submit}>
        {mode === "id" ? (
          <>
            <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 12px" }}>
              メールアドレスをお持ちでない方のための画面です。会社の担当者から受け取った紙に書かれている「ログインID」と「合言葉」を入力してください。
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>ログインID(数字8けた)</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="username"
                required
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                placeholder="例: 1234 5678"
                maxLength={12}
                style={{ ...input, fontSize: 20, letterSpacing: "0.08em" }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>合言葉(英字4文字+数字4けた)</label>
              <input
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="例: abcd2345"
                maxLength={12}
                style={{ ...input, fontSize: 20, letterSpacing: "0.08em" }}
              />
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
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
          {mode === "email" ? (
            <Link href="/reset-password" style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
              パスワードを忘れた方
            </Link>
          ) : (
            <span style={{ fontSize: 12.5, color: "#5B6B6A" }}>紙をなくした方は、会社の担当者にお知らせください</span>
          )}
        </div>
      </form>
      {/* ログインの基本はメールアドレス。ログインIDは、メールアドレスのない方だけの例外なので、目立たせずに下に置く
          (担当者が渡す紙のQRコード・URLからは、最初からログインIDの画面が開く) */}
      <p style={{ fontSize: 12.5, color: "#7A8886", lineHeight: 1.7, margin: "18px 0 0", paddingTop: 12, borderTop: `1px solid ${brand.line}` }}>
        {mode === "email" ? "メールアドレスをお持ちでなく、会社の担当者から「ログインIDの紙」を受け取った方は" : "メールアドレスで登録した方は"}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "email" ? "id" : "email");
            setErr(null);
            setUnconfirmed(false);
          }}
          style={{ background: "none", border: 0, padding: 0, marginLeft: 4, color: brand.tealDark, fontSize: 12.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}
        >
          {mode === "email" ? "こちら" : "メールアドレスでログイン"}
        </button>
      </p>
      {/* 個人情報保護法第32条に基づく安全管理措置の概要(保存先・外部事業者)の案内 */}
      <p style={{ fontSize: 12, color: "#7A8886", lineHeight: 1.7, margin: "10px 0 0" }}>
        回答と結果は暗号化のうえ日本国内（東京）のサーバーに保存します。保存と画面処理には米国の事業者（Supabase、Vercel）のサービスを利用しています。
        <Link href="/privacy" style={{ color: brand.tealDark, fontWeight: 700, marginLeft: 4 }}>
          個人情報の取扱いについて
        </Link>
      </p>
    </Card>
  );
}
