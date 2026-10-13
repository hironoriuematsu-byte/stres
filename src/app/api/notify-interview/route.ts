import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { IMPLEMENTER } from "@/lib/org";
import { sendViaResend, sleep } from "@/lib/mail";
import { fiscalYearOf, interviewDoctorLabel, interviewNotifiesOffice, jstDate } from "@/lib/plan";

export const runtime = "nodejs";
export const maxDuration = 60; // 宛先数分の送信間隔・再試行に耐えられるようにする

// 面接指導申出の通知メール(仕様4.1)。
// 申出INSERT直後にフロントから呼ばれ、office全員+該当企業のjimu全員へ
// 1人ずつ個別送信する。本文に個人名・スコアは含めない。
// Web申込の企業は、面接指導の担当に「うえまつ産業医事務所の医師」を選んでいるときだけ office にも送り、
// 自社の産業医・地域産業保健センターのときは会社の jimu だけに送る。
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

  const { data: company } = await admin
    .from("companies")
    .select("name, web_signup")
    .eq("id", request.company_id)
    .single();

  // Web申込の企業: 申出の年度の「面接指導の担当」(その年度の申込がなければ直近の年度)
  const webSignup = Boolean(company?.web_signup);
  let option: string | null = null;
  if (webSignup) {
    const fy = fiscalYearOf(jstDate(request.created_at));
    const { data: plans } = await admin
      .from("exam_plans")
      .select("fiscal_year, interview_option")
      .eq("company_id", request.company_id)
      .lte("fiscal_year", fy)
      .order("fiscal_year", { ascending: false })
      .limit(1);
    option = (plans?.[0]?.interview_option as string | null) ?? null;
  }
  const toOffice = interviewNotifiesOffice(webSignup, option);

  // 通知先: (office全員) + 該当企業のjimu全員
  const [officesRes, jimusRes] = await Promise.all([
    toOffice ? admin.from("profiles").select("user_id").eq("role", "office") : Promise.resolve({ data: [] as { user_id: string }[] }),
    admin.from("profiles").select("user_id").eq("role", "jimu").eq("company_id", request.company_id),
  ]);
  const userIds = [
    ...new Set([...(officesRes.data ?? []), ...(jimusRes.data ?? [])].map((r) => r.user_id)),
  ];

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
    ...(webSignup ? [`医師面接指導の担当: ${interviewDoctorLabel(option)}`] : []),
    ...(webSignup && option === "own" ? ["", "自社の産業医など、会社で手配した医師と面接指導の日程を調整してください(当事務所には通知されていません)。"] : []),
    ...(webSignup && option === "sanpo"
      ? [
          "",
          "最寄りの地域産業保健センター(無料・50人未満の事業場)に面接指導をお申し込みください(当事務所には通知されていません)。",
          "連絡先は、労働者健康安全機構の各都道府県の産業保健総合支援センターのページに掲載されています: https://www.johas.go.jp/",
        ]
      : []),
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
      toOffice
        ? `実施者(${IMPLEMENTER.full})および会社の実施事務従事者へ通知済みです。`
        : `会社の実施事務従事者へ通知済みです(医師面接指導の担当: ${interviewDoctorLabel(option)})。`,
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
      `${IMPLEMENTER.officeName}(${IMPLEMENTER.corporateName})`,
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
