import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60; // 宛先数分の送信間隔・再試行に耐えられるようにする

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resend APIは1秒あたり2リクエストまでのため、1通ずつ間隔を空けて送信し、
// 429(レート制限)の場合は待って再試行する
async function sendViaResend(
  resendKey: string,
  payload: { from: string; to: string[]; subject: string; text: string }
): Promise<{ ok: boolean; detail?: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) return { ok: true };
      const detail = `${res.status} ${await res.text()}`;
      if (res.status === 429) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
      return { ok: false, detail };
    } catch (e) {
      return { ok: false, detail: String(e) };
    }
  }
  return { ok: false, detail: "429 rate limited(再試行上限に達しました)" };
}

// 面接指導申出の通知メール(仕様4.1)。
// 申出INSERT直後にフロントから呼ばれ、office全員+該当企業のjimu全員へ
// 1人ずつ個別送信する。本文に個人名・スコアは含めない。
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let requestId: string | undefined;
  try {
    const body = await req.json();
    requestId = body.requestId;
  } catch {
    /* fallthrough */
  }
  if (!requestId) {
    return NextResponse.json({ error: "requestIdが必要です" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const sender = process.env.SENDER_EMAIL;
  if (!serviceKey || !resendKey || !sender) {
    return NextResponse.json(
      {
        error:
          "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY / SENDER_EMAIL のいずれかが未設定です",
      },
      { status: 500 }
    );
  }

  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 申出が実在し、呼び出し元本人のものであることを確認(なりすまし・スパム送信防止)
  const { data: request } = await admin
    .from("interview_requests")
    .select("id, user_id, company_id, created_at, message, preferred")
    .eq("id", requestId)
    .single();
  if (!request || request.user_id !== user.id) {
    return NextResponse.json({ error: "申出が見つかりません" }, { status: 404 });
  }

  // 通知先: office全員 + 該当企業のjimu全員
  const [officesRes, jimusRes] = await Promise.all([
    admin.from("profiles").select("user_id").eq("role", "office"),
    admin.from("profiles").select("user_id").eq("role", "jimu").eq("company_id", request.company_id),
  ]);
  const userIds = [
    ...new Set([...(officesRes.data ?? []), ...(jimusRes.data ?? [])].map((r) => r.user_id)),
  ];

  const { data: company } = await admin
    .from("companies")
    .select("name")
    .eq("id", request.company_id)
    .single();

  const emails: string[] = [];
  for (const id of userIds) {
    const { data } = await admin.auth.admin.getUserById(id);
    if (data?.user?.email) emails.push(data.user.email);
  }

  if (emails.length === 0) {
    return NextResponse.json({ sent: 0, note: "通知先がいません" });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  // 本文に個人名・スコアは書かない
  const text = [
    "面接指導の申出が1件あります。システムにログインして確認してください。",
    "",
    `企業名: ${company?.name ?? "(不明)"}`,
    `ログイン: ${origin}`,
  ].join("\n");

  console.log(
    `notify-interview recipients: office=${officesRes.data?.length ?? 0}, jimu=${jimusRes.data?.length ?? 0}, emails=${emails.length}`
  );

  // 1人ずつ個別送信(宛先の相互開示を防ぎ、1件の失敗で全体を止めない)
  let sent = 0;
  const failures: string[] = [];
  for (let i = 0; i < emails.length; i++) {
    if (i > 0) await sleep(600); // レート制限(2通/秒)を超えないよう間隔を空ける
    const result = await sendViaResend(resendKey, {
      from: sender,
      to: [emails[i]],
      subject: "【ストレスチェックWeb】面接指導の申出があります",
      text,
    });
    if (result.ok) {
      sent++;
    } else {
      failures.push(`${emails[i]}: ${result.detail}`);
    }
  }

  if (failures.length > 0) {
    console.error("notify-interview send failures:", failures);
  }

  // 申出した本人への受付確認メール(本人宛のため申出内容を含めてよい)
  let sentRequester = false;
  if (user.email) {
    const selfText = [
      "産業医面接指導の申出を受け付けました。",
      "実施者(うえまつ産業医事務所)および会社の実施事務従事者へ通知済みです。",
      "日程等について連絡がありますので、しばらくお待ちください。",
      "",
      `申出日時: ${new Date(request.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
      `相談したいこと・連絡事項: ${request.message || "(記載なし)"}`,
      "",
      "※本申出により、厚生労働省の指針に基づき、ストレスチェック結果を事業者へ提供することに同意したものとして取り扱われます。",
      "※面接指導の申出を理由とする不利益な取り扱いは、法律で禁止されています。",
      "※このメールに心当たりがない場合は、会社の実施事務従事者までお知らせください。",
      "",
      `ストレスチェックWeb: ${origin}`,
      "うえまつ産業医事務所(Mestate LLC)",
    ].join("\n");
    if (emails.length > 0) await sleep(600); // レート制限対策の送信間隔
    const result = await sendViaResend(resendKey, {
      from: sender,
      to: [user.email],
      subject: "【ストレスチェックWeb】産業医面接指導の申出を受け付けました",
      text: selfText,
    });
    sentRequester = result.ok;
    if (!result.ok) {
      console.error("notify-interview self-send failure:", result.detail);
    }
  }

  return NextResponse.json({ sent, failed: failures.length, sentRequester });
}
