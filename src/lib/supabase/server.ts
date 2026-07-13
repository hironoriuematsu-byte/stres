import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // 共有PC対策: 有効期限を外しセッションCookie化(削除時のみ期限を残す)
              cookieStore.set(
                name,
                value,
                value ? { ...options, maxAge: undefined, expires: undefined } : options
              )
            );
          } catch {
            // Server Component から呼ばれた場合は無視(middleware がセッションを更新する)
          }
        },
      },
    }
  );
}
