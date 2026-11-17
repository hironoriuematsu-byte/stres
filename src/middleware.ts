import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SS_GATE_PATH, SS_HINT_COOKIE, sessionIdOf } from "@/lib/second-step";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PROTECTED_PREFIXES = ["/exam", "/office", "/jimu", "/company", "/my", "/account", "/intake", "/paper"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            // 共有PC対策: 有効期限を外しセッションCookie化(削除時のみ期限を残す)
            response.cookies.set(
              name,
              value,
              value ? { ...options, maxAge: undefined, expires: undefined } : options
            )
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const needsAuth = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (needsAuth && !user) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  // 二段階認証: このログインが確認済み(または確認不要)と分かっていなければ、通り道(gate)へ回す。
  // gate が、確認コードの入力画面に進むか、そのまま元の行き先へ戻すかを決める。
  // ここは画面の行き先を決めるだけで、権限そのものはデータベースが判定する
  if (user && request.method === "GET" && (needsAuth || path === "/")) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const sid = sessionIdOf(session?.access_token);
    if (sid && request.cookies.get(SS_HINT_COOKIE)?.value !== sid) {
      const gate = new URL(SS_GATE_PATH, request.url);
      gate.searchParams.set("next", path + request.nextUrl.search);
      const redirect = NextResponse.redirect(gate);
      // 更新されたログインのCookieを引き継ぐ
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
