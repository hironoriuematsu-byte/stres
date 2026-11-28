import { Suspense } from "react";
import { LoginForm } from "./LoginForm";
import { DEFAULT_ID_EMAIL_DOMAIN } from "@/lib/no-email";

// ログイン画面は検索結果に出さない(契約企業の方はURLから直接アクセスする)
export const metadata = {
  title: "ログイン",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense>
      {/* IDでログインする方(メールアドレスのない方)の内部用アドレスのドメインを渡す */}
      <LoginForm idDomain={process.env.ID_LOGIN_EMAIL_DOMAIN?.trim() || DEFAULT_ID_EMAIL_DOMAIN} />
    </Suspense>
  );
}
