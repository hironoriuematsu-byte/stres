import type { SupabaseClient } from "@supabase/supabase-js";
import { requestUser } from "@/lib/supabase/server";
import { adminClient } from "@/lib/plan-server";

// 未受検者リマインドの権限: 実施者(office)は全企業、実施事務従事者(jimu)は誓約済みで自社のみ
export async function remindContext(
  req: Request,
  companyId: string
): Promise<{ ok: true; admin: SupabaseClient; userId: string; role: string } | { ok: false; status: number; error: string }> {
  const user = await requestUser(req);
  if (!user) return { ok: false, status: 401, error: "ログインの有効期限が切れました。ページを再読み込みしてください。" };
  const admin = adminClient();
  if (!admin) return { ok: false, status: 500, error: "サーバー設定エラー: SUPABASE_SERVICE_ROLE_KEY が未設定です" };
  const { data: prof } = await admin.from("profiles").select("role, company_id, no_personnel_authority").eq("user_id", user.id).maybeSingle();
  const role = (prof?.role as string | undefined) ?? "";
  const allowed = role === "office" || (role === "jimu" && prof?.company_id === companyId && Boolean(prof?.no_personnel_authority));
  if (!allowed) return { ok: false, status: 403, error: "この企業の未受検者にリマインドを送る権限がありません" };
  return { ok: true, admin, userId: user.id, role };
}
