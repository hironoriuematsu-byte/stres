import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// 配布URL(/join/<token>)からの従業員自己登録。
// 1) トークンを検証して企業を特定
// 2) メール+パスワードでサインアップ(確認メール送信 = 個人認証)
// 3) プロフィール(role=employee, 該当企業)を作成
export async function POST(req: Request) {
  let token: string | undefined, email: string | undefined, password: string | undefined;
  try {
    const body = await req.json();
    token = body.token;
    email = body.email;
    password = body.password;
  } catch {
    /* fallthrough */
  }
  if (!token || !email || !password || password.length < 8) {
    return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 });
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

  // anonキーでサインアップ(標準の確認メールが送信される)
  const anon = createSupabaseClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/exam`,
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

  // プロフィール作成(氏名・社員番号・部署は本人が受検時に入力)
  const { error: profErr } = await admin.from("profiles").upsert({
    user_id: data.user!.id,
    role: "employee",
    name: "未設定",
    emp_id: null,
    dept: null,
    company_id: campaign.company_id,
  });
  if (profErr) {
    return NextResponse.json({ error: `登録エラー: ${profErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
