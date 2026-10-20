import { NextResponse } from "next/server";
import { getFiscalYear } from "@/lib/fiscal";
import { addDays, formatJpDate, jstToday } from "@/lib/plan";
import { adminClient, sendMails } from "@/lib/plan-server";
import { SELLER } from "@/lib/org";
import { sendExamReminders } from "@/lib/exam-reminder";

export const runtime = "nodejs";
export const maxDuration = 60;

// 更新の案内メール(毎日1回、Vercel Cron から呼ばれる)。
// Web申込の企業のうち、前年度に受検があり今年度の申込がまだない企業の担当者へ、
// 前年の受検開始日の約1か月半前(45日前)と2週間前(14日前)に「今年もそろそろ時期です」と案内する。
// 送った記録は plan_reminders に残し、同じ案内は二重に送らない。
// あわせて、受検を始めたのに数日たっても回答を送っていない人へ、1回だけ催促する(exam-reminder.ts)
export async function GET(req: Request) {
  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を付けて呼ぶ。それ以外からの呼び出しは断る
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "no service key" }, { status: 500 });

  const today = jstToday();
  const fy = getFiscalYear();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;

  // 前年度・今年度の受検期間(Web申込の企業のみ)
  const { data: plans } = await admin
    .from("exam_plans")
    .select("company_id, fiscal_year, exam_start, seats")
    .in("fiscal_year", [fy - 1, fy, fy + 1]);
  const byCompany = new Map<string, { fiscal_year: number; exam_start: string; seats: number }[]>();
  for (const p of plans ?? []) {
    const list = byCompany.get(p.company_id) ?? [];
    list.push(p);
    byCompany.set(p.company_id, list);
  }

  let sent = 0;
  for (const [companyId, list] of byCompany) {
    // 案内の基準: いちばん新しい年度の受検開始日の1年後(その年度の申込がまだ無い場合)
    const last = [...list].sort((a, b) => b.fiscal_year - a.fiscal_year)[0];
    const target = last.fiscal_year + 1;
    if (list.some((p) => p.fiscal_year === target)) continue;
    const anniv = `${Number(last.exam_start.slice(0, 4)) + 1}${last.exam_start.slice(4)}`;
    const kind = today === addDays(anniv, -45) ? "45d" : today === addDays(anniv, -14) ? "14d" : null;
    if (!kind) continue;

    // 二重に送らないよう、先に記録する(すでにあれば送らない)
    const { error: dup } = await admin.from("plan_reminders").insert({ company_id: companyId, fiscal_year: target, kind });
    if (dup) continue;

    const [{ data: company }, { data: jimus }] = await Promise.all([
      admin.from("companies").select("name, office_name, web_signup").eq("id", companyId).single(),
      admin.from("profiles").select("user_id").eq("role", "jimu").eq("company_id", companyId),
    ]);
    if (!company?.web_signup) continue;
    const emails: string[] = [];
    for (const j of jimus ?? []) {
      const { data: u } = await admin.auth.admin.getUserById(j.user_id);
      if (u?.user?.email) emails.push(u.user.email);
    }
    if (emails.length === 0) continue;
    await sendMails(
      emails,
      `【ストレスチェックWeb】${target}年度のストレスチェックのご案内`,
      [
        `${company.name}${company.office_name ? ` ${company.office_name}` : ""} ストレスチェックご担当者さま`,
        "",
        `昨年度は${formatJpDate(last.exam_start)}からストレスチェックを実施いただきました。`,
        `${target}年度の実施時期が近づいてきましたので、ご案内いたします。`,
        "",
        "■ お申込み方法(昨年度と同じ画面です)",
        `1. ログインします: ${origin}/login?next=/jimu`,
        "2. メニュー画面の「次の年度のお申込み」で、受検予定人数と受検期間を入れてお支払いください。",
        "   昨年度の人数があらかじめ入っています。従業員の皆さまの登録し直しは不要です。",
        "",
        "ご担当者さまが変わる場合は、ログイン後の画面の「従業員招待」から新しいご担当者さまを追加できます。",
        `ログインできる方がいない場合は ${SELLER.email} までご連絡ください。`,
      ].join("\n")
    );
    sent++;
  }
  const examReminded = await sendExamReminders(admin, origin);
  return NextResponse.json({ ok: true, sent, examReminded });
}
