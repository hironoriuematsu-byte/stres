import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// IDでログインした方は、最初に生年月日で本人確認を済ませてから受検・結果の画面に進む。
// 済んでいなければ確認の画面へ送る(SQL 0034 の実行前は列がないので、何もしない)
export async function requireIdConfirmed(userId: string, next: string): Promise<void> {
  const { data, error } = await createClient().from("profiles").select("login_id, id_confirmed_at").eq("user_id", userId).maybeSingle();
  if (error || !data) return;
  if (data.login_id && !data.id_confirmed_at) redirect(`/account/confirm-id?next=${encodeURIComponent(next)}`);
}
