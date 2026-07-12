// Supabase Edge Function: notify-interview
//
// Database Webhook (interview_requests INSERT) から呼ばれ、
// 該当企業の実施事務従事者(jimu)全員と実施者(office)全員へ、
// 1人ずつ個別にメール通知する(宛先が互いに見えない/1件の失敗が他を止めない)。
//
// 個人名・スコア等の要配慮情報はメール本文に含めない(仕様4.1)。
//
// 必要な secrets:
//   RESEND_API_KEY   Resend のAPIキー
//   SENDER_EMAIL     送信元 (例: noreply@example.jp — Resendで認証済みドメイン)
//   APP_URL          アプリURL (例: https://stres.vercel.app)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は実行環境から自動注入される。

import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record;
    if (!record?.company_id) {
      return new Response(JSON.stringify({ error: "invalid payload" }), { status: 400 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 通知先: office 全員 + 該当企業の jimu 全員
    const [{ data: offices, error: e1 }, { data: jimus, error: e2 }] = await Promise.all([
      admin.from("profiles").select("user_id").eq("role", "office"),
      admin.from("profiles").select("user_id").eq("role", "jimu").eq("company_id", record.company_id),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const userIds = [...new Set([...(offices ?? []), ...(jimus ?? [])].map((r) => r.user_id))];

    const { data: company } = await admin
      .from("companies")
      .select("name")
      .eq("id", record.company_id)
      .single();

    const emails: string[] = [];
    for (const id of userIds) {
      const { data } = await admin.auth.admin.getUserById(id);
      if (data?.user?.email) emails.push(data.user.email);
    }

    if (emails.length === 0) {
      return new Response(JSON.stringify({ sent: 0, note: "no recipients" }), { status: 200 });
    }

    const appUrl = Deno.env.get("APP_URL") ?? "";
    // 本文に個人名・スコアは書かない
    const body = [
      "面接指導の申出が1件あります。システムにログインして確認してください。",
      "",
      `企業名: ${company?.name ?? "(不明)"}`,
      appUrl ? `ログイン: ${appUrl}` : "",
    ].join("\n");

    // 1人ずつ個別送信(宛先の相互開示を防ぎ、1件の失敗で全体が止まらないように)
    let sent = 0;
    const failures: string[] = [];
    for (const to of emails) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: Deno.env.get("SENDER_EMAIL"),
          to: [to],
          subject: "【ストレスチェックWeb】面接指導の申出があります",
          text: body,
        }),
      });
      if (res.ok) {
        sent++;
      } else {
        failures.push(`${to}: ${res.status} ${await res.text()}`);
      }
    }

    if (failures.length > 0) {
      console.error("send failures:", failures);
    }

    return new Response(JSON.stringify({ sent, failed: failures.length }), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
