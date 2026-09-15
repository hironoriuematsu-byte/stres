import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

// 1回の画面表示(リクエスト)の中で、レイアウトとページの両方から呼ばれても
// ログイン確認とプロフィールの問い合わせを1回にまとめる(React の cache による同一リクエスト内の共有)。
// 以前は毎回 Supabase Auth への確認が2回走っていた
export const getSessionProfile = cache(async function getSessionProfile(): Promise<{
  user: { id: string; email?: string } | null;
  profile: Profile | null;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const COLS = "user_id, role, name, emp_id, dept, company_id, no_personnel_authority, attested_at";
  let { data: profile } = await supabase
    .from("profiles")
    .select(`${COLS}, hm_company_access`)
    .eq("user_id", user.id)
    .single();

  // 0017 が未適用でこの列が無い環境でもログインできるようにする
  if (!profile) {
    ({ data: profile } = await supabase.from("profiles").select(COLS).eq("user_id", user.id).single());
  }

  return { user, profile: (profile as Profile) ?? null };
});

export function roleHome(role: string | undefined | null): string {
  switch (role) {
    case "office":
      return "/office";
    case "jimu":
      return "/jimu";
    case "company":
      return "/company";
    case "employee":
      return "/my";
    default:
      return "/login";
  }
}
