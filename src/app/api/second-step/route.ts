import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth-server";
import { adminClient } from "@/lib/plan-server";
import { KENKO_URL } from "@/lib/org";
import { checkMessage, isCode, maskEmail, normalizeCode } from "@/lib/second-step";
import {
  checkCode,
  currentLogin,
  issueAndSend,
  mailStatus,
  serverReady,
  sessionVerified,
  setDeviceCookie,
  setHintCookie,
  stepState,
  tryDevice,
} from "@/lib/second-step-server";

export const dynamic = "force-dynamic";

const APP_NAME = "ストレスチェックWeb";
const fail = (status: number, error: string, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// 二段階認証(メールの確認コード)。
//   GET                 このアプリの準備状況(もう一方のアプリから確かめるため。秘密は返さない)
//   GET  ?settings=1    スイッチの状態(事務所)
//   POST { action: "send" }                      確認コードを送る(不要な方・確認済みの方は done を返す)
//        { action: "verify", code, remember }    確認コードを照合する
//        { action: "test-send" | "test-verify" } 有効にする前に、事務所が自分で試す
//        { action: "mail-status", id }           試しに送ったメールが、相手のメールサーバーに届いたか(事務所)
//        { action: "enable", group, on }         スイッチを切り替える(事務所。オンにするのは、自分で試したあとだけ)
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const admin = adminClient();
  const settings = admin ? await admin.rpc("second_step_settings") : null;
  const applied = Boolean(settings && !settings.error);
  if (!q.get("settings")) return NextResponse.json({ ready: serverReady(), applied });

  const { profile } = await getSessionProfile();
  if (profile?.role !== "office") return fail(403, "権限がありません");
  const { user, sessionId } = await currentLogin();
  const value = (applied ? settings!.data : {}) as { office?: boolean; staff?: boolean };
  // もう一方のアプリ(健康管理Web)の準備状況
  let kenko: { url: string; ready: boolean; applied: boolean } | null = null;
  if (KENKO_URL) {
    try {
      const res = await fetch(`${KENKO_URL.replace(/\/$/, "")}/api/second-step`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      const j = res.ok ? ((await res.json()) as { ready?: boolean; applied?: boolean }) : {};
      kenko = { url: KENKO_URL, ready: Boolean(j.ready), applied: Boolean(j.applied) };
    } catch {
      kenko = { url: KENKO_URL, ready: false, applied: false };
    }
  }
  // 対象になる人数
  let counts = { office: 0, staff: 0 };
  if (admin) {
    const [o, s] = await Promise.all([
      admin.from("profiles").select("user_id", { count: "exact", head: true }).eq("role", "office"),
      admin.from("profiles").select("user_id", { count: "exact", head: true }).or("role.in.(jimu,company),hm_company_access.eq.true"),
    ]);
    counts = { office: o.count ?? 0, staff: s.count ?? 0 };
  }
  return NextResponse.json({
    applied,
    ready: serverReady(),
    office: Boolean(value.office),
    staff: Boolean(value.staff),
    tested: Boolean(user && sessionId && (await sessionVerified(user.id, sessionId))),
    email: maskEmail(user?.email),
    kenko,
    counts,
  });
}

export async function POST(req: Request) {
  let body: { action?: unknown; code?: unknown; remember?: unknown; group?: unknown; on?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, "リクエスト形式が不正です");
  }
  const { supabase, user, sessionId } = await currentLogin();
  if (!user) return fail(401, "ログインの有効期限が切れました。もう一度ログインしてください。");
  if (!sessionId) return fail(401, "ログインの情報を確認できませんでした。いったんログアウトして、もう一度ログインしてください。");
  const action = String(body.action ?? "");
  const label = (req.headers.get("user-agent") ?? "").slice(0, 200);

  if (action === "send") {
    const s = await stepState(supabase);
    const done = () => {
      const res = NextResponse.json({ done: true });
      setHintCookie(res, sessionId);
      return res;
    };
    if (!s.required || s.verified) return done();
    if (await tryDevice(user.id, sessionId)) return done();
    const r = await issueAndSend(user, APP_NAME);
    if (r.ok) return NextResponse.json({ sent: true, to: maskEmail(user.email), wait: r.done ? 0 : r.wait });
    // 送ったばかり(画面の再読み込みなど)は、失敗ではなく「送信済み」として扱う
    if (r.status === 429 && (r.wait ?? 0) <= 60) return NextResponse.json({ sent: true, already: true, to: maskEmail(user.email), wait: r.wait ?? 60 });
    return fail(r.status, r.error, { wait: r.wait });
  }

  if (action === "verify" || action === "test-verify") {
    const code = normalizeCode(String(body.code ?? ""));
    if (!isCode(code)) return fail(400, "確認コードは、メールに書かれた6けたの数字です。");
    const remember = action === "verify" && body.remember === true;
    const { result, device } = await checkCode(user.id, sessionId, code, remember, label);
    if (result !== "ok") return fail(result === "error" ? 503 : 400, checkMessage(result), { result });
    const res = NextResponse.json({ ok: true });
    setHintCookie(res, sessionId);
    if (device) setDeviceCookie(res, device);
    return res;
  }

  // ここから下は事務所だけ
  const { profile } = await getSessionProfile();
  if (profile?.role !== "office") return fail(403, "権限がありません");
  const admin = adminClient();
  if (!admin) return fail(503, "サーバーの設定が未完了です(SUPABASE_SERVICE_ROLE_KEY)");

  if (action === "test-send") {
    const r = await issueAndSend(user, APP_NAME);
    // 届くのが遅いときに、どこで時間がかかったかを見分けられるよう、送信にかかった時間と受付番号も返す
    if (r.ok) return NextResponse.json({ sent: true, to: maskEmail(user.email), wait: r.done ? 0 : r.wait, ms: r.done ? null : r.ms, mailId: r.done ? null : (r.mailId ?? null) });
    return fail(r.status, r.error, { wait: r.wait });
  }

  // 試しに送ったメールの配信状況(相手のメールサーバーに届いたか)
  if (action === "mail-status") {
    return NextResponse.json({ event: await mailStatus(String(body.id ?? "")) });
  }

  if (action === "enable") {
    const group = body.group === "office" || body.group === "staff" ? body.group : null;
    if (!group || typeof body.on !== "boolean") return fail(400, "指定が正しくありません");
    // オンにできるのは、このログインで確認コードを実際に受け取って入力できた方だけ
    // (メールが届かない状態で有効にして、全員が入れなくなるのを防ぐ)
    if (body.on && !(await sessionVerified(user.id, sessionId))) {
      return fail(400, "有効にする前に、「自分のメールで試す」で確認コードを受け取り、入力してください。");
    }
    const { data, error } = await admin.rpc("second_step_enable", { p_group: group, p_on: body.on, p_actor: user.id });
    if (error) return fail(503, "切り替えられませんでした(SQL 0035 が未適用の可能性があります)");
    const res = NextResponse.json({ ok: true, ...(data as { office?: boolean; staff?: boolean }) });
    setHintCookie(res, sessionId);
    return res;
  }
  return fail(400, "操作の指定が不正です");
}
