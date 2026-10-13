import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ReceiptSheet } from "@/components/ReceiptSheet";
import { adminClient, registrationNo } from "@/lib/plan-server";
import { receiptFromOrder } from "@/lib/receipt";

export const metadata = { title: "領収書 | ストレスチェックWeb" };
export const dynamic = "force-dynamic";

// Web申込の領収書。見られるのは、その企業の実施事務従事者と実施者のみ
export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/plan/receipt/${params.id}`);

  const admin = adminClient();
  const notFound = (
    <Card style={{ maxWidth: 560, margin: "0 auto" }}>
      <p style={{ fontSize: 14, margin: 0 }}>領収書が見つかりません。</p>
    </Card>
  );
  if (!admin) return notFound;
  const [{ data: me }, { data: order }] = await Promise.all([
    admin.from("profiles").select("role, company_id").eq("user_id", user.id).single(),
    admin
      .from("plan_orders")
      .select("*") // seats_granted は SQL 0026 以降の列のため、列名を指定しない
      .eq("id", params.id)
      .maybeSingle(),
  ]);
  const allowed = me && order && (me.role === "office" || (me.role === "jimu" && me.company_id === order.company_id));
  if (!allowed || !order.paid_at || (order.status !== "paid" && order.status !== "provisioned")) return notFound;

  return <ReceiptSheet r={receiptFromOrder(order, registrationNo())} stripeHref={`/api/plan/receipt?order=${order.id}`} />;
}
