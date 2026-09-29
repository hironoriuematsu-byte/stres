import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// サーバーから Supabase Auth を呼ぶとき、利用者本人のIPアドレスを伝えるためのヘッダー。
// Supabase のレート制限(IPごと)がVercelのIPにまとめて掛からないようにする
export function clientIpHeaders(request: Request): Record<string, string> {
  const xff = request.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "";
  return ip ? { "x-forwarded-for": ip } : {};
}

export function createClient(options?: { headers?: Record<string, string> }) {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: options?.headers ? { headers: options.headers } : undefined,
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
