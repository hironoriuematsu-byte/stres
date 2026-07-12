import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
    .select("id, user_id, company_id, created_at")
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

  // 1人ずつ個別送信(宛先の相互開示を防ぎ、1件の失敗で全体を止めない)
  let sent = 0;
  const failures: string[] = [];
  for (const to of emails) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: sender,
          to: [to],
          subject: "【ストレスチェックWeb】面接指導の申出があります",
          text,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        failures.push(`${to}: ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      failures.push(`${to}: ${String(e)}`);
    }
  }

  if (failures.length > 0) {
    console.error("notify-interview send failures:", failures);
  }

  return NextResponse.json({ sent, failed: failures.length });
}
