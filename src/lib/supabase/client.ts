import { createBrowserClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

// 共有PC対策: 認証Cookieに有効期限を付けない「セッションCookie」として保存する。
// ブラウザを完全に閉じるとログイン状態が消え、次の利用者は必ず
// メールアドレスとパスワードの入力が必要になる。
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return document.cookie
            .split("; ")
            .filter(Boolean)
            .map((pair) => {
              const eq = pair.indexOf("=");
              return {
                name: pair.slice(0, eq),
                value: decodeURIComponent(pair.slice(eq + 1)),
              };
            });
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            let cookie = `${name}=${encodeURIComponent(value)}; Path=${options?.path ?? "/"}; SameSite=Lax`;
            if (!value) cookie += "; Max-Age=0"; // サインアウト時の削除のみ期限を付ける
            if (window.location.protocol === "https:") cookie += "; Secure";
            document.cookie = cookie;
          });
        },
      },
    }
  );
}
