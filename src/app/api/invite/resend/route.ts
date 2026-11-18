import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/plan-server";
import { sendViaResend } from "@/lib/mail";
import { isIdEmail } from "@/lib/no-email";
import { KENKO_URL } from "@/lib/org";
import { stepBlocked, STEP_BLOCKED_MESSAGE } from "@/lib/second-step-state";
import { mailStatus } from "@/lib/second-step-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

// 招待メールの送り直し(実施者のみ)。
// 登録はあるが、まだ一度もログインしていない方(メール未確認・未ログイン)に、パスワードを設定するためのリンクを送る。
//   POST { userId }     送り直す
//   POST { statusId }   送ったメールが相手のメールサーバーに届いたか(送信サービスに問い合わせる)
// リンクは Supabase に発行してもらい、メールはこのアプリから送る(送った結果をその場で確かめられるようにするため)。
// メールには、氏名や健康に関する情報を書かない
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "認証が必要です");
  // 二段階認証の対象の方は、確認コードの入力が済んでから
  if (await stepBlocked(supabase)) return fail(401, STEP_BLOCKED_MESSAGE);

  const admin = adminClient();
  const resendKey = process.env.RESEND_API_KEY;
  const sender = process.env.SENDER_EMAIL;
  if (!admin || !resendKey || !sender) {
    return fail(500, "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY / SENDER_EMAIL のいずれかが未設定です");
  }
  const { data: me } = await admin.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
  if (me?.role !== "office") return fail(403, "この操作は実施者のみ可能です");

  let body: { userId?: unknown; statusId?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }

  if (typeof body.statusId === "string") {
    return NextResponse.json({ event: await mailStatus(body.statusId) });
  }

  const userId = typeof body.userId === "string" && /^[0-9a-fA-F-]{36}$/.test(body.userId) ? body.userId : "";
  if (!userId) return fail(400, "対象の方が指定されていません");

  const [{ data: target }, { data: found, error: userErr }] = await Promise.all([
    admin.from("profiles").select("role, company_id, hm_company_access").eq("user_id", userId).maybeSingle(),
    admin.auth.admin.getUserById(userId),
  ]);
  const account = found?.user;
  if (userErr || !account?.email) return fail(404, "アカウントが見つかりません");
  if (isIdEmail(account.email)) return fail(400, "メールアドレスのない方(IDでログインする方)には送れません。「メール・スマホのない方」から、IDの紙を印刷し直してください");
  if (account.last_sign_in_at) {
    return fail(400, "すでにログインしたことのある方です。パスワードが分からない場合は、ログイン画面の「パスワードを忘れた方」をご案内ください");
  }
  const role = (target?.role as string | undefined) ?? "";
  const logTarget = `${account.email} (${role || "役割なし"})`;

  // 続けて何通も送らない(1分あける)
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data: recent } = await admin.from("access_logs").select("created_at").eq("action", "invite_resend").eq("target", logTarget).gte("created_at", since).limit(1);
  if (recent && recent.length > 0) return fail(429, "送ったばかりです。1分ほど待ってから、もう一度お試しください");

  // メールが未確認の方には招待用、確認済み(未ログイン)の方にはパスワード設定用のリンクを発行する
  let link = await admin.auth.admin.generateLink({ type: account.email_confirmed_at ? "recovery" : "invite", email: account.email });
  if (link.error && !account.email_confirmed_at) link = await admin.auth.admin.generateLink({ type: "recovery", email: account.email });
  const props = link.data?.properties;
  if (link.error || !props?.hashed_token) {
    console.error("invite resend: generateLink failed", link.error?.message);
    return fail(502, `リンクを発行できませんでした${link.error?.message ? `(${link.error.message})` : ""}`);
  }
  const type = props.verification_type === "recovery" ? "recovery" : "invite";
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const url = `${origin}/auth/callback?token_hash=${encodeURIComponent(props.hashed_token)}&type=${type}&next=${encodeURIComponent("/account/update-password")}`;
  const usesKenko = Boolean(KENKO_URL) && (role === "company" || target?.hm_company_access === true);
  const text = [
    "うえまつ産業医事務所です。ストレスチェックWeb のアカウントのご案内を、あらためてお送りします。",
    "",
    "下のリンクを開き、表示されるボタンを押して、パスワードを設定してください。",
    "",
    url,
    "",
    ...(usesKenko ? [`健康管理Web(${KENKO_URL})も、同じメールアドレスとパスワードでご利用いただけます。`, ""] : []),
    "・このリンクは1回だけ使えます。以前にお送りしたメールのリンクは使えなくなりました。",
    `・リンクの有効期限が切れていた場合は、ログイン画面(${origin}/login)の「パスワードを忘れた方」から、このメールアドレスを入力してお手続きください。`,
    "・このメールにお心当たりがない場合は、破棄してください。",
    "",
    "うえまつ産業医事務所",
  ].join("\n");
  const mail = await sendViaResend(resendKey, { from: sender, to: [account.email], subject: "【ストレスチェックWeb】アカウントのご案内(パスワードの設定)", text });
  if (!mail.ok) {
    console.error("invite resend: mail failed", mail.detail);
    return fail(502, "メールを送れませんでした。少し待ってから、もう一度お試しください");
  }

  await admin.from("access_logs").insert({ user_id: user.id, role: "office", action: "invite_resend", target: logTarget, company_id: target?.company_id ?? null });
  return NextResponse.json({ ok: true, email: account.email, mailId: mail.id ?? null });
}
