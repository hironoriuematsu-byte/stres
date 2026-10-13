import { DemoNotice } from "../../DemoNotice";
import { PlanOrderPanel } from "@/components/PlanOrderPanel";
import { getFiscalYear } from "@/lib/fiscal";

export const metadata = { title: "年度のお申込み(サンプル) | ストレスチェックWeb" };
export const dynamic = "force-dynamic";

// 紹介用: 会社を登録した後、担当者がログインした画面に出る「ストレスチェックのお申込み」
export default function DemoPlanOrderPage() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <DemoNotice />
      <PlanOrderPanel companyId="demo-company" currentYear={getFiscalYear()} preview={{ workers: 32 }} />
    </div>
  );
}
