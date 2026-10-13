import { NextResponse } from "next/server";
import { checkEmailDomain } from "@/lib/email-domain-check";
import { jstToday, officeKey, parseSignupInput } from "@/lib/plan";
import { adminClient, officeEmails, sendMails } from "@/lib/plan-server";
import { IMPLEMENTER, SELLER } from "@/lib/org";
import { stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

// 会社(事業場)の登録。お支払いはまだ行わず、登録した担当者がログイン後の画面で年度ごとに申し込む。
// 担当者の確認メールは、従業員の受検登録(Supabase の確認メール)とは別の、担当者向けの内容でこちらから送る。
// リンクを開くと担当者の画面(誓約 → 受検人数・期間の入力とお支払い)に進む。
// 同じ会社の二重登録を防ぐため、次の場合は登録せずにログインへ案内する:
//   - メールアドレスがすでに登録されている
//   - 「登録番号(インボイス)または法人番号 + 事業場名」が一致する会社がすでにある
export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "現在、Web申込は準備中です。お手数ですがメールでお問い合わせください。" }, { status: 503 });
  }
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" }, { status: 500 });

  let raw: Record<string, unknown>;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = parseSignupInput(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const v = parsed.value;

  const domain = await checkEmailDomain(v.contactEmail);
  if (!domain.ok) return NextResponse.json({ error: domain.message }, { status: 400 });

  const key = officeKey(v.officeName);
  const office = await officeEmails(admin);
  const alreadyMsg =
    "この事業場はすでに登録されています。ご担当者さまがログインして、ログイン後の画面からお申し込みください。" +
    "ご担当者さまが分からない・変わった場合は support@mestate.jp までご連絡ください(新しいご担当者さまをお招きします)。";

  // 同じ番号・同じ事業場の会社がすでにある → 新しく作らない(実施者にも知らせる)
  if (v.bizId) {
    const { data: same } = await admin
      .from("companies")
      .select("id, name, code")
      .eq("web_signup", true)
      .eq("biz_id", v.bizId)
      .eq("office_key", key)
      .limit(1);
    if (same && same.length > 0) {
      await sendMails(
        office,
        "【ストレスチェックWeb】登録済みの事業場から、もう一度会社登録がありました",
        `会社名: ${v.companyName} ${v.officeName}\n担当者: ${v.contactName} (${v.contactEmail} / ${v.contactPhone})\n` +
          `登録済みの企業: ${same[0].name}(企業コード ${same[0].code})\n\n` +
          "登録はせず、ご担当者のログインへ案内しました。担当者の交代などの可能性があるので、必要ならご連絡ください。"
      );
      return NextResponse.json({ error: alreadyMsg, exists: true }, { status: 409 });
    }
  }

  // いたずらの大量登録を防ぐ(全体で10分間に10件まで)
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { count: recent } = await admin
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("web_signup", true)
    .gte("created_at", since);
  if ((recent ?? 0) >= 10) {
    return NextResponse.json({ error: "ただいま登録が混み合っています。10分ほどおいてからもう一度お試しください。" }, { status: 429 });
  }

  // 企業を作る(企業コード: W + 登録日 + 英数字3文字)
  const day = jstToday().replace(/-/g, "").slice(2);
  let company: { id: string; code: string } | null = null;
  for (let i = 0; i < 5 && !company; i++) {
    const code = `W${day}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const { data, error } = await admin
      .from("companies")
      .insert({
        name: v.companyName,
        code,
        web_signup: true,
        biz_id: v.bizId,
        office_name: v.officeName,
        office_key: key,
        address: v.address,
        workers: v.workers,
        contact_phone: v.contactPhone,
      })
      .select("id, code")
      .single();
    if (data) company = data;
    else if (error?.code === "23505" && /uq_companies_web_biz_office/.test(error.message)) {
      return NextResponse.json({ error: alreadyMsg, exists: true }, { status: 409 }); // 同時に登録された
    } else if (error?.code !== "23505") {
      return NextResponse.json({ error: `登録できませんでした: ${error?.message ?? ""}` }, { status: 500 });
    }
  }
  if (!company) return NextResponse.json({ error: "登録できませんでした。もう一度お試しください。" }, { status: 500 });

  // 担当者のアカウントを作る。確認用のリンクだけを発行し(Supabase からはメールを送らない)、メールはこちらから送る
  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.headers.get("origin") || new URL(req.url).origin;
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "signup",
    email: v.contactEmail,
    password: v.password,
    options: { data: { full_name: v.contactName } },
  });
  const existsMsg =
    "このメールアドレスはすでに登録されています。ログインして、ログイン後の画面からお申し込みください(パスワードを忘れた場合は再設定できます)。";
  if (linkErr || !link?.user || !link.properties?.hashed_token) {
    await admin.from("companies").delete().eq("id", company.id); // 作りかけの企業を消す
    const exists = linkErr && (linkErr.code === "email_exists" || /already been registered|already exists/i.test(linkErr.message));
    if (exists) return NextResponse.json({ error: existsMsg, exists: true }, { status: 409 });
    return NextResponse.json({ error: `登録できませんでした: ${linkErr?.message ?? ""}` }, { status: 400 });
  }
  const confirmUrl =
    `${origin}/auth/callback?token_hash=${encodeURIComponent(link.properties.hashed_token)}` +
    `&type=${encodeURIComponent(link.properties.verification_type || "signup")}&next=${encodeURIComponent("/jimu")}`;
  const sendConfirm = (companyName: string) =>
    sendMails(
      [v.contactEmail],
      "【ストレスチェックWeb】担当者アカウントの確認(会社登録)",
      [
        companyName,
        `${v.contactName} 様`,
        "",
        "ストレスチェックWebに会社をご登録いただき、ありがとうございます。",
        "下のリンクを開き、「アカウントを有効にして担当者の画面へ」を押してください。ストレスチェックの担当者(実施事務従事者)の画面が開きます。",
        "",
        confirmUrl,
        "",
        "■ このあとの流れ",
        "1. 担当者としての誓約(人事権がないこと・守秘義務)",
        "2. 受検予定人数と受検期間を入力して、お支払い(クレジットカード等)",
        "3. お支払い後、従業員の皆さまに配る受検用のURL・QRコードが使えるようになります",
        "   (ほかの担当者の追加も、同じ画面からできます)",
        "",
        "※ リンクの有効期限は、このメールが届いてから1時間です。期限が切れた場合は、ログイン画面の「パスワードを忘れた方」から再設定するとログインできます。",
        "※ このメールに心当たりがない場合は、破棄してください。",
        "",
        `実施者: ${IMPLEMENTER.full}(${IMPLEMENTER.officeName})`,
        `お問い合わせ: ${SELLER.email}`,
      ].join("\n")
    );

  // すでにあるアカウント(従業員として登録済み・別の会社の担当者など)は、新しい会社に付け替えない
  const { data: prof } = await admin.from("profiles").select("role, company_id").eq("user_id", link.user.id).maybeSingle();
  if (prof) {
    await admin.from("companies").delete().eq("id", company.id);
    // 以前に会社登録して、確認メールのリンクをまだ開いていない担当者には、確認メールを送り直す
    if (!link.user.email_confirmed_at && prof.role === "jimu" && prof.company_id) {
      const { data: prev } = await admin.from("companies").select("name").eq("id", prof.company_id).maybeSingle();
      await sendConfirm(prev?.name ?? v.companyName);
      return NextResponse.json({ ok: true, resent: true });
    }
    return NextResponse.json({ error: existsMsg, exists: true }, { status: 409 });
  }

  const { error: profErr } = await admin.from("profiles").upsert({
    user_id: link.user.id,
    role: "jimu",
    name: v.contactName,
    emp_id: null,
    dept: null,
    company_id: company.id,
  });
  if (profErr) {
    return NextResponse.json({ error: `登録エラー: ${profErr.message}。support@mestate.jp までご連絡ください` }, { status: 500 });
  }

  // 同じ番号で別の事業場がすでにある場合は、実施者に知らせる(複数の事業場をお持ちの会社)
  let note = "";
  if (v.bizId) {
    const { data: others } = await admin
      .from("companies")
      .select("name, office_name, code")
      .eq("web_signup", true)
      .eq("biz_id", v.bizId)
      .neq("id", company.id);
    if (others && others.length > 0) {
      note = `\n※ 同じ番号の別の事業場: ${others.map((o) => `${o.name} ${o.office_name ?? ""}(${o.code})`).join("、")}`;
    }
  }
  await sendMails(
    office,
    "【ストレスチェックWeb】Web申込の会社登録がありました",
    `会社名: ${v.companyName} ${v.officeName}\n企業コード: ${company.code}\n番号: ${v.bizId ?? "(なし)"}\n所在地: ${v.address}\n` +
      `労働者数: ${v.workers}名\n担当者: ${v.contactName} (${v.contactEmail} / ${v.contactPhone})${note}\n\n` +
      "お支払いは、担当者がログイン後の画面で年度ごとに行います。"
  );

  await sendConfirm(`${v.companyName} ${v.officeName}`);
  return NextResponse.json({ ok: true });
}
