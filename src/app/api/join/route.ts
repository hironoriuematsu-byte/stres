import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cleanPersonName, isValidPersonName } from "@/lib/name";
import { clientIpHeaders } from "@/lib/supabase/server";
import { checkEmailDomain } from "@/lib/email-domain-check";
import { birthDateError, isMissingBirthDateColumn } from "@/lib/birth-date";

export const runtime = "nodejs";

// 配布URL(/join/<token>)からの従業員自己登録。
// 1) トークンを検証して企業を特定
// 2) メール+パスワードでサインアップ(確認メール送信 = 個人認証)
// 3) プロフィール(role=employee, 該当企業, 氏名)を作成
//    氏名は登録時に必須(以前は受検時に入力する作りで、未設定のまま残る利用者がいたため)
export async function POST(req: Request) {
  let token: string | undefined, name: string | undefined, email: string | undefined, password: string | undefined;
  let birthDate: string | undefined;
  try {
    const body = await req.json();
    token = body.token;
    name = body.name;
    email = body.email;
    password = body.password;
    birthDate = typeof body.birthDate === "string" ? body.birthDate : undefined;
  } catch {
    /* fallthrough */
  }
  if (!token || !email || !password || password.length < 8) {
    return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
  }
  if (!isValidPersonName(name)) {
    return NextResponse.json({ error: "氏名を入力してください(空白だけの入力はできません)" }, { status: 400 });
  }
  const cleanName = cleanPersonName(name);
  // 生年月日(健康管理Webとの突合用)。古い画面からの送信(未指定)は許容する
  if (birthDate != null) {
    const birthErr = birthDateError(birthDate);
    if (birthErr) return NextResponse.json({ error: birthErr }, { status: 400 });
  }

  // 存在しないドメイン(入力ミス)には確認メールが届かないため、送信前に止める
  const domainCheck = await checkEmailDomain(email);
  if (!domainCheck.ok) {
    return NextResponse.json({ error: domainCheck.message }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" },
      { status: 500 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // トークン検証(有効なキャンペーンのみ)
  const { data: campaign } = await admin
    .from("campaigns")
    .select("company_id, active")
    .eq("token", token)
    .single();
  if (!campaign || !campaign.active) {
    return NextResponse.json({ error: "このURLは無効か、配布が終了しています" }, { status: 400 });
  }

  // anonキーでサインアップ(標準の確認メールが送信される)。
  // 本人のIPを添えて、サインアップのレート制限(IPごと)がVercelのIPにまとめて掛からないようにする
  const anon = createSupabaseClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: clientIpHeaders(req) },
  });
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/exam`,
      data: { full_name: cleanName },
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // 既存メールの場合、Supabaseはダミーユーザー(identitiesが空)を返す
  const isNewUser = (data.user?.identities?.length ?? 0) > 0;
  if (!isNewUser) {
    return NextResponse.json({ alreadyRegistered: true });
  }

  // プロフィール作成(社員番号・部署は本人が受検時に入力)
  const baseProfile: Record<string, unknown> = {
    user_id: data.user!.id,
    role: "employee",
    name: cleanName,
    emp_id: null,
    dept: null,
    company_id: campaign.company_id,
  };
  let { error: profErr } = await admin
    .from("profiles")
    .upsert(birthDate ? { ...baseProfile, birth_date: birthDate } : baseProfile);
  // SQL 0024 が未実行で birth_date 列が無い場合は、生年月日なしで登録する
  if (profErr && birthDate && isMissingBirthDateColumn(profErr.message)) {
    ({ error: profErr } = await admin.from("profiles").upsert(baseProfile));
  }
  if (profErr) {
    return NextResponse.json({ error: `登録エラー: ${profErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
