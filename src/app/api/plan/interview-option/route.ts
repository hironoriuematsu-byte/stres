import { NextResponse } from "next/server";
import { requestUser } from "@/lib/supabase/server";
import { interviewDoctorLabel, interviewOptionError } from "@/lib/plan";
import { adminClient, officeEmails, sendMails } from "@/lib/plan-server";

export const runtime = "nodejs";

// Web申込の企業の担当者(実施事務従事者)が、その年度の「産業医面接指導の担当」を変更する。
// 変更後に届いた申出から、通知先が変わる(当事務所の医師を選んだときだけ実施者にも通知)
export async function POST(req: Request) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });

  let body: { fiscalYear?: unknown; option?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const fiscalYear = Number(body.fiscalYear);
  const option = typeof body.option === "string" ? body.option : null;
  if (!Number.isInteger(fiscalYear)) return NextResponse.json({ error: "年度が不正です" }, { status: 400 });

  // 変更できるのは自社の担当者だけ(誓約済み)
  const { data: me } = await admin
    .from("profiles")
    .select("role, company_id, name, no_personnel_authority")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me || me.role !== "jimu" || !me.company_id || !me.no_personnel_authority) {
    return NextResponse.json({ error: "変更できるのは自社の担当者(実施事務従事者)だけです" }, { status: 403 });
  }
  const { data: co } = await admin.from("companies").select("name, web_signup").eq("id", me.company_id).maybeSingle();
  if (!co?.web_signup) return NextResponse.json({ error: "Web申込の企業ではありません" }, { status: 400 });

  const { data: plan } = await admin
    .from("exam_plans")
    .select("interview_option, workers")
    .eq("company_id", me.company_id)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (!plan) return NextResponse.json({ error: `${fiscalYear}年度のお申込みがありません` }, { status: 404 });
  const err = interviewOptionError(option, plan.workers as number | null);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  if (plan.interview_option === option) return NextResponse.json({ ok: true, unchanged: true });

  const { data: updated, error } = await admin
    .from("exam_plans")
    .update({ interview_option: option, updated_at: new Date().toISOString() })
    .eq("company_id", me.company_id)
    .eq("fiscal_year", fiscalYear)
    .select("interview_option");
  if (error) return NextResponse.json({ error: `変更できませんでした: ${error.message}` }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "変更できませんでした(対象の年度のお申込みが見つかりません)。support@mestate.jp までご連絡ください" }, { status: 500 });
  }

  // 実施者(当事務所)にも変更を知らせる(当事務所の医師が担当になる・担当から外れるのを把握するため)
  await sendMails(
    await officeEmails(admin),
    "【ストレスチェックWeb】医師面接指導の担当が変更されました",
    `企業: ${co.name}\n年度: ${fiscalYear}年度\n変更: ${interviewDoctorLabel(plan.interview_option as string | null)} → ${interviewDoctorLabel(option)}\n変更した担当者: ${me.name ?? ""}`
  );
  return NextResponse.json({ ok: true });
}
