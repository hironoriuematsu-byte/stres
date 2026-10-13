import { stripeConfigured } from "@/lib/stripe";
import { SignupForm } from "./SignupForm";

export const metadata = { title: "会社の登録 | ストレスチェックWeb" };
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return <SignupForm enabled={stripeConfigured()} />;
}
