import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// 遷移先はサイト内のパスに限定する(外部サイトへの転送を防ぐ)
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

const OTP_TYPES: EmailOtpType[] = ["invite", "signup", "recovery", "email_change", "magiclink", "email"];

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// メール内リンクを開いたときの中継ページ。
// 会社のメールセキュリティ(リンクの自動検査)がリンクを先に開いてしまうと、
// 1回限りのトークンが消費されて本人が開いたときに「期限切れ」になる。
// 本人がボタンを押したとき(POST)に初めてトークンを使うことでこれを防ぐ。
function confirmPage(tokenHash: string, type: string, next: string): Response {
  const heading = type === "recovery" ? "パスワードの再設定" : type === "invite" ? "アカウントの有効化" : "メールアドレスの確認";
  const button =
    type === "recovery" ? "新しいパスワードを設定する" : type === "invite" ? "パスワードを設定して利用を開始する" : "続ける";
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${heading} | うえまつ産業医事務所 ストレスチェックWeb</title>
<style>
  body { margin: 0; background: #F4F7F7; font-family: 'Meiryo','Hiragino Sans','Yu Gothic',sans-serif; color: #22333B; }
  .wrap { max-width: 440px; margin: 48px auto; padding: 0 16px; }
  .card { background: #fff; border: 1px solid #DDE5E4; border-radius: 14px; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.8; margin: 0 0 16px; }
  button { display: inline-block; width: 100%; background: #0F9B8E; color: #fff; font-weight: 700; font-size: 15px; border: 0; border-radius: 10px; padding: 14px 20px; cursor: pointer; }
  .note { font-size: 12px; color: #7A8886; margin: 14px 0 0; }
</style>
</head>
<body>
<div class="wrap"><div class="card">
<h1>${heading}</h1>
<p>うえまつ産業医事務所 ストレスチェックWeb です。下のボタンを押して次へ進んでください。</p>
<form method="post" action="/auth/callback">
<input type="hidden" name="token_hash" value="${escapeHtml(tokenHash)}" />
<input type="hidden" name="type" value="${escapeHtml(type)}" />
<input type="hidden" name="next" value="${escapeHtml(next)}" />
<button type="submit">${button}</button>
</form>
<p class="note">このリンクはメールが届いてから1時間有効です。期限が切れた場合は、ログイン画面の「パスワードを忘れた方」から再度お手続きください。</p>
</div></div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = safeNext(searchParams.get("next"));

  // PKCEフロー(メールを要求したブラウザと同じブラウザで開いたときだけ成功する)
  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  // token_hashフロー(メールテンプレートからの直接リンク)。ここではまだトークンを使わず、ボタン押下(POST)で使う
  if (tokenHash && type && (OTP_TYPES as string[]).includes(type)) {
    return confirmPage(tokenHash, type, next);
  }

  // どちらでもない場合(implicitフローの#トークンはサーバーに届かないため、
  // そのまま遷移して各ページのクライアント側フォールバックに委ねる)
  return NextResponse.redirect(`${origin}${next}`);
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "");
  const next = safeNext(form.get("next") ? String(form.get("next")) : null);

  if (!tokenHash || !(OTP_TYPES as string[]).includes(type)) {
    return NextResponse.redirect(`${origin}/login?error=link`, 303);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType });
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link`, 303);
  }
  return NextResponse.redirect(`${origin}${next}`, 303);
}
