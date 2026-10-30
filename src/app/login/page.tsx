import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

// ログイン画面は検索結果に出さない(契約企業の方はURLから直接アクセスする)
export const metadata = {
  title: "ログイン",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
