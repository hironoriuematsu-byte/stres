import { GroupReportView } from "@/app/group-report/[companyId]/[year]/GroupReportView";
import { DemoNotice } from "@/app/demo/DemoNotice";
import { buildDemoPeople, DEMO_COMPANY, DEMO_FISCAL_YEAR, demoGroupRows } from "@/lib/demo-data";

// 紹介用デモ: 架空の集団分析報告書(DBは参照しない)
export default function DemoGroupReportPage({ searchParams }: { searchParams: { q?: string } }) {
  const questionnaire = searchParams.q === "80" ? "80" : "57";
  const rows = demoGroupRows(buildDemoPeople(), questionnaire);

  return (
    <>
      <DemoNotice />
      <GroupReportView
        companyId="demo-company"
        companyName={DEMO_COMPANY}
        fiscalYear={DEMO_FISCAL_YEAR}
        demoRows={rows}
      />
    </>
  );
}
