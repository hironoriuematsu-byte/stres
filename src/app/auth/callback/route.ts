import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = createClient();

  // PKCEフロー(アプリ発のメールリンク: パスワード再設定など)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // token_hashフロー(招待メールなど、メールテンプレートからの直接リンク)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return NextResponse.redirect(`${origin}/login?error=expired`);
  }

  // どちらでもない場合(implicitフローの#トークンはサーバーに届かないため、
  // そのまま遷移して各ページのクライアント側フォールバックに委ねる)
  return NextResponse.redirect(`${origin}${next}`);
}
