import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// office専用: 指定企業のメンバー一覧(氏名・ロール・メールアドレス)を返す。
// メールアドレスはauth側にあるためservice_roleで取得する(本人特定のための表示用)。
// body に { query } を渡すと、企業をまたいでメールアドレス・氏名で検索する(所属企業を調べる用途)。
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
  let query: string | undefined;
  try {
    const body = await req.json();
    companyId = body.companyId;
    query = typeof body.query === "string" ? body.query.trim().toLowerCase() : undefined;
  } catch {
    /* fallthrough */
  }
  if (!companyId && !query) {
    return NextResponse.json({ error: "companyId または query が必要です" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEYが未設定です" }, { status: 500 });
  }
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // メールアドレス・最終ログインをまとめて取得(1000件/ページで走査)
  const userById = new Map<string, { email: string; lastSignIn: string | null; confirmed: boolean }>();
  for (let page = 1; page <= 20; page++) {
    const { data: usersPage, error: uErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (uErr) break;
    usersPage.users.forEach((u) => {
      userById.set(u.id, {
        email: u.email ?? "",
        lastSignIn: u.last_sign_in_at ?? null,
        confirmed: !!u.email_confirmed_at,
      });
    });
    if (usersPage.users.length < 1000) break;
  }

  // 企業をまたいだ検索(メールアドレスの一部、または氏名の一部で一致)
  if (query) {
    if (query.length < 2) {
      return NextResponse.json({ error: "2文字以上で検索してください" }, { status: 400 });
    }
    const idsByEmail = Array.from(userById.entries())
      .filter(([, u]) => u.email.toLowerCase().includes(query))
      .map(([id]) => id);
    const { data: byEmail } = idsByEmail.length
      ? await admin
          .from("profiles")
          .select("user_id, name, emp_id, dept, role, company_id, hm_company_access, hm_view_only, companies(name)")
          .in("user_id", idsByEmail.slice(0, 200))
      : { data: [] };
    const { data: byName } = await admin
      .from("profiles")
      .select("user_id, name, emp_id, dept, role, company_id, hm_company_access, hm_view_only, companies(name)")
      .ilike("name", `%${query.replace(/[%_]/g, "")}%`)
      .limit(100);
    const seen = new Set<string>();
    const rows = [...(byEmail ?? []), ...(byName ?? [])].filter((p) => {
      if (seen.has(p.user_id)) return false;
      seen.add(p.user_id);
      return true;
    });
    // プロフィールが無いアカウント(招待後にパスワード未設定など)も、メールで一致すれば出す
    const noProfile = idsByEmail.filter((id) => !seen.has(id)).slice(0, 50);
    const found = rows.map((p) => {
      const company = Array.isArray(p.companies) ? p.companies[0] : p.companies;
      const u = userById.get(p.user_id);
      return {
        user_id: p.user_id,
        name: p.name,
        emp_id: p.emp_id,
        dept: p.dept,
        role: p.role,
        hm_company_access: p.hm_company_access,
        hm_view_only: p.hm_view_only,
        email: u?.email ?? "",
        company_id: p.company_id as string | null,
        company_name: (company as { name: string } | null)?.name ?? "",
        last_sign_in_at: u?.lastSignIn ?? null,
        confirmed: u?.confirmed ?? false,
      };
    });
    for (const id of noProfile) {
      const u = userById.get(id)!;
      found.push({
        user_id: id, name: "", emp_id: null, dept: null, role: "", hm_company_access: false, hm_view_only: false,
        email: u.email, company_id: null, company_name: "", last_sign_in_at: u.lastSignIn, confirmed: u.confirmed,
      });
    }
    return NextResponse.json({ found });
  }

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("user_id, name, emp_id, dept, role, hm_company_access, hm_view_only")
    .eq("company_id", companyId!)
    .order("role")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    members: (profiles ?? []).map((p) => ({
      ...p,
      email: userById.get(p.user_id)?.email ?? "",
    })),
  });
}
