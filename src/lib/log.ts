import type { SupabaseClient } from "@supabase/supabase-js";

// アクセスログ記録(仕様4.4)。失敗しても画面の動作は止めない。
export async function logAccess(
  supabase: SupabaseClient,
  action: string,
  target: string,
  companyId: string | null
) {
  try {
    await supabase.rpc("log_access", {
      p_action: action,
      p_target: target,
      p_company: companyId,
    });
  } catch {
    // ログ失敗は握りつぶす(監査ログ自体はDBトリガー分もある)
  }
}
