import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type InviteInput = {
  email: string;
  name: string;
  emp_id?: string;
  dept?: string;
  company_code: string;
  role?: "employee" | "jimu" | "company";
};

const ALLOWED_ROLES = new Set(["employee", "jimu", "company"]);

export async function POST(req: Request) {
  // 1) 呼び出し元が office ロールであることを検証(セッションCookieベース)
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" },
      { status: 500 }
    );
  }

  // service_role クライアントはサーバー内でのみ生成(フロントに露出しない — 仕様5)
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (callerProfile?.role !== "office") {
    return NextResponse.json({ error: "この操作は実施者(office)のみ可能です" }, { status: 403 });
  }

  let invites: InviteInput[];
  try {
    const body = await req.json();
    invites = body.invites;
    if (!Array.isArray(invites) || invites.length === 0 || invites.length > 500) {
      throw new Error("invalid");
    }
  } catch {
    return NextResponse.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const inv of invites) {
    try {
      const role = inv.role && ALLOWED_ROLES.has(inv.role) ? inv.role : "employee";
      if (!inv.email || !inv.name || !inv.company_code) {
        throw new Error("メール・氏名・企業コードは必須です");
      }

      const { data: company } = await admin
        .from("companies")
        .select("id")
        .eq("code", inv.company_code)
        .single();
      if (!company) throw new Error(`企業コード「${inv.company_code}」が見つかりません`);

      const { data: invited, error: invErr } = await admin.auth.admin.inviteUserByEmail(inv.email, {
        redirectTo: `${origin}/auth/callback?next=/account/update-password`,
      });
      if (invErr) throw new Error(invErr.message);

      const { error: profErr } = await admin.from("profiles").upsert({
        user_id: invited.user.id,
        role,
        name: inv.name,
        emp_id: inv.emp_id || null,
        dept: inv.dept || null,
        company_id: company.id,
      });
      if (profErr) throw new Error(profErr.message);

      // 招待操作をアクセスログに記録(仕様4.4)
      await admin.from("access_logs").insert({
        user_id: user.id,
        role: "office",
        action: "invite_user",
        target: `${inv.email} (${role})`,
        company_id: company.id,
      });

      results.push({ email: inv.email, ok: true });
    } catch (e) {
      results.push({ email: inv.email ?? "(不明)", ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return NextResponse.json({ results });
}
