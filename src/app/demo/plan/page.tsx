import Link from "next/link";
import { DemoNotice } from "../DemoNotice";
import { PlanStatusPanel } from "@/components/PlanStatusPanel";
import { addDays, jstToday, maxEndOf } from "@/lib/plan";
import { getFiscalYear } from "@/lib/fiscal";
import { brand } from "@/lib/brand";

export const metadata = { title: "Web申込の担当者画面(サンプル) | ストレスチェックWeb" };
export const dynamic = "force-dynamic";

// 紹介用: Web申込をした企業の担当者(実施事務従事者)の画面に表示される「受検期間・受検者数」の欄
export default function DemoPlanPage() {
  const today = jstToday();
  const start = addDays(today, -10);
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <DemoNotice />
      <PlanStatusPanel
        companyId="demo-company"
        fiscalYear={getFiscalYear()}
        canEdit
        preview={{
          seats: 30,
          used: 21,
          exam_start: start,
          exam_end: addDays(start, 27),
          max_end: maxEndOf(start),
          interview_option: "mestate",
          workers: 32,
        }}
      />
      <p style={{ fontSize: 13, color: "#5B6B6A", margin: 0 }}>
        お申込みは <Link href="/plan" style={{ color: brand.tealDark }}>サービスのご案内</Link> から。
      </p>
    </div>
  );
}
