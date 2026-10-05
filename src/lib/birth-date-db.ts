import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingBirthDateColumn } from "@/lib/birth-date";

// プロフィールの生年月日を読む。SQL 0024 が未実行で列が無い場合は supported=false を返し、
// 画面側は生年月日の入力欄を出さない(アプリの更新とSQLの実行順序に依存しないため)
export async function fetchBirthDate(
  supabase: SupabaseClient,
  userId: string
): Promise<{ supported: boolean; value: string | null }> {
  const { data, error } = await supabase.from("profiles").select("birth_date").eq("user_id", userId).maybeSingle();
  if (error) {
    if (isMissingBirthDateColumn(error.message)) return { supported: false, value: null };
    return { supported: true, value: null };
  }
  return { supported: true, value: (data as { birth_date: string | null } | null)?.birth_date ?? null };
}

// 本人の生年月日を保存する。列が無い場合は何もしない(false を返す)
export async function saveBirthDate(supabase: SupabaseClient, userId: string, value: string): Promise<boolean> {
  const { error } = await supabase.from("profiles").update({ birth_date: value }).eq("user_id", userId);
  if (error) {
    if (isMissingBirthDateColumn(error.message)) return false;
    throw error;
  }
  return true;
}
