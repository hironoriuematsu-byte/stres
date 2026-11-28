import { VerifyForm } from "./VerifyForm";

export const metadata = { title: "契約書の確認(真正性の検証)", robots: { index: false, follow: false } };

// 締結済みの契約書が改ざんされていないかを、契約番号と文面のハッシュで確認するページ(ログイン不要)
export default function VerifyPage() {
  return <VerifyForm />;
}
