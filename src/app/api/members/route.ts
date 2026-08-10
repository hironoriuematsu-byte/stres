import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// office専用: 指定企業のメンバー一覧(氏名・ロール・メールアドレス)を返す。
// メールアドレスはauth側にあるためservice_roleで取得する(本人特定のための表示用)。
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { data: me } = await supabase.from("profiles").select("role").eq("user_id", user.id).single();
  if (me?.role !== "office") {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let companyId: string | undefined;
  try {
    const body = await req.json();
    companyId = body.companyId;
  } catch {
    /* fallthrough */
  }
  if (!companyId) {
    return NextResponse.json({ error: "companyIdが必要です" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEYが未設定です" }, { status: 500 });
  }
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("user_id, name, emp_id, dept, role")
    .eq("company_id", companyId)
    .order("role")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // メールアドレスをまとめて取得(1000件/ページで走査)
  const emailById = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data: usersPage, error: uErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (uErr) break;
    usersPage.users.forEach((u) => {
      if (u.email) emailById.set(u.id, u.email);
    });
    if (usersPage.users.length < 1000) break;
  }

  return NextResponse.json({
    members: (profiles ?? []).map((p) => ({
      ...p,
      email: emailById.get(p.user_id) ?? "",
    })),
  });
}
