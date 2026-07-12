import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getSessionProfile(): Promise<{
  user: { id: string; email?: string } | null;
  profile: Profile | null;
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, role, name, emp_id, dept, company_id, no_personnel_authority, attested_at")
    .eq("user_id", user.id)
    .single();

  return { user, profile: (profile as Profile) ?? null };
}

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
