import { redirect } from "next/navigation";

// 旧URL(その場で支払う申込)。会社を先に登録する方式に変わったため、会社の登録へ移す
export default function ApplyPage() {
  redirect("/plan/signup");
}
