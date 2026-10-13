import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFiscalYear } from "@/lib/fiscal";
import { formatJpDate, seatAlertLevel, UNIT_PRICE } from "@/lib/plan";
import { adminClient, sendMails } from "@/lib/plan-server";
import { SELLER } from "@/lib/org";

export const runtime = "nodejs";
export const maxDuration = 60;

// Web申込の企業で、受検者数が人数枠の8割・満員に達したら、自社の担当者(実施事務従事者)にメールで知らせる。
// 受検の確定後に受検者の画面から呼ばれる。同じ段階のお知らせは人数枠ごとに1回だけ
// (人数を追加して枠が変われば、再び8割・満員で知らせる)。
// 受検期間・人数枠の登録がない企業(これまでの契約企業)では何もしない
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ skipped: "no service key" });

  const { data: me } = await admin.from("profiles").select("company_id").eq("user_id", user.id).single();
  if (!me?.company_id) return NextResponse.json({ skipped: "no company" });
  const companyId = me.company_id as string;
  const fiscalYear = getFiscalYear();

  const { data: co } = await admin.from("companies").select("web_signup").eq("id", companyId).maybeSingle();
  if (!co?.web_signup) return NextResponse.json({ skipped: "not web" }); // 顧問契約の企業は人数枠なし
  const { data: plan, error: planErr } = await admin
    .from("exam_plans")
    .select("seats, exam_start, exam_end, alert80_seats, alert_full_seats")
    .eq("company_id", companyId)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (planErr || !plan) return NextResponse.json({ skipped: "no plan" });

  const { count } = await admin
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("fiscal_year", fiscalYear);
  const used = count ?? 0;
  const seats = plan.seats as number;
  const level = seatAlertLevel(used, seats);
  if (!level) return NextResponse.json({ ok: true, level: null });

  // 同時に呼ばれても1回だけ送るよう、「この人数枠では未送信」の行だけを更新できた場合に送る
  const column = level === "full" ? "alert_full_seats" : "alert80_seats";
  const patch = level === "full" ? { alert_full_seats: seats, alert80_seats: seats } : { alert80_seats: seats };
  const { data: claimed } = await admin
    .from("exam_plans")
    .update(patch)
    .eq("company_id", companyId)
    .eq("fiscal_year", fiscalYear)
    .eq("seats", seats)
    .or(`${column}.is.null,${column}.neq.${seats}`)
    .select("company_id");
  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, already: true });

  // 宛先: 自社の実施事務従事者
  const [{ data: jimus }, { data: company }] = await Promise.all([
    admin.from("profiles").select("user_id").eq("role", "jimu").eq("company_id", companyId),
    admin.from("companies").select("name").eq("id", companyId).single(),
  ]);
  const emails: string[] = [];
  for (const j of jimus ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(j.user_id);
    if (u?.user?.email) emails.push(u.user.email);
  }
  if (emails.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  const full = level === "full";
  await sendMails(
    emails,
    full
      ? "【ストレスチェックWeb】受検人数がお申込みの人数に達しました(追加が必要です)"
      : "【ストレスチェックWeb】受検人数がお申込みの人数の8割に達しました",
    [
      `${company?.name ?? ""} ストレスチェックご担当者さま`,
      "",
      full
        ? `受検者数がお申込みの人数(${seats}名)に達したため、現在、これ以上の受検ができない状態です。`
        : `受検者数がお申込みの人数の8割に達しました(${used}名 / ${seats}名)。`,
      full
        ? "まだ受検する方がいる場合は、受検人数を追加してください。追加後すぐに受検できるようになります。"
        : "これから受検する方が残りの人数より多い場合は、受検が止まらないよう、早めに受検人数を追加してください。",
      "",
      `受検期間: ${formatJpDate(plan.exam_start as string)} 〜 ${formatJpDate(plan.exam_end as string)}`,
      `受検者数: ${used}名 / ${seats}名`,
      "",
      "■ 受検人数の追加",
      `ログイン後の画面の「${fiscalYear}年度の受検期間・受検者数」から、1名 ${UNIT_PRICE}円(税込)で追加できます。`,
      `${origin}/jimu`,
      "",
      `お問い合わせ: ${SELLER.email}`,
    ].join("\n")
  );
  return NextResponse.json({ ok: true, level, sent: emails.length });
}
