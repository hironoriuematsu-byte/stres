import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { InvoiceSheet } from "@/components/InvoiceSheet";
import { adminClient, registrationNo } from "@/lib/plan-server";
import { invoiceFromOrder } from "@/lib/receipt";
import { stepBlocked } from "@/lib/second-step-state";
import { SS_GATE_PATH } from "@/lib/second-step";

export const metadata = { title: "請求書 | ストレスチェックWeb" };
export const dynamic = "force-dynamic";

// Web申込(銀行振込)の請求書。お振込み待ちの間だけ表示できる。見られるのは、その企業の実施事務従事者と実施者のみ
export default async function InvoicePage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/plan/invoice/${params.id}`);
  // 二段階認証の対象の方は、確認コードの入力が済んでから
  if (await stepBlocked(supabase)) redirect(`${SS_GATE_PATH}?next=${encodeURIComponent(`/plan/invoice/${params.id}`)}`);

  const admin = adminClient();
  const message = (text: string) => (
    <Card style={{ maxWidth: 560, margin: "0 auto" }}>
      <p style={{ fontSize: 14, margin: 0, lineHeight: 1.8 }}>{text}</p>
    </Card>
  );
  if (!admin || !/^[0-9a-f-]{36}$/i.test(params.id)) return message("請求書が見つかりません。");
  const [{ data: me }, { data: order }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("user_id", user.id).single(),
    admin.from("plan_orders").select("*").eq("id", params.id).maybeSingle(),
  ]);
  const allowed = me && order && (me.role === "office" || (me.role === "jimu" && me.company_id === order.company_id));
  if (!allowed) return message("請求書が見つかりません。");
  if (order.status === "paid" || order.status === "provisioned") {
    return message("このお申込みは、ご入金を確認済みです。領収書は、ログイン後の画面の「お支払いの記録」から表示できます。");
  }
  if (order.status !== "pending" || order.pay_method !== "bank_transfer") return message("このお申込みは取り消されたため、請求書は表示できません。");

  return <InvoiceSheet r={invoiceFromOrder(order, registrationNo())} />;
}
