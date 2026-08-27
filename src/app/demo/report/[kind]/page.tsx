import { notFound } from "next/navigation";
import { ReportView } from "@/app/report/[id]/ReportView";
import { DemoNotice } from "@/app/demo/DemoNotice";
import { buildDemoPeople, DEMO_COMPANY, demoResultRow } from "@/lib/demo-data";

// 紹介用デモ: 架空の個人結果票(DBは参照しない)
export default function DemoReportPage({
  params,
  searchParams,
}: {
  params: { kind: string };
  searchParams: { q?: string };
}) {
  const questionnaire = searchParams.q === "80" ? "80" : "57";
  if (params.kind !== "high" && params.kind !== "normal") notFound();

  const people = buildDemoPeople();
  // 高ストレス例は最も反応が強い人、通常例は中央付近の人を選ぶ(常に同じ人)
  const sorted = [...people].sort((a, b) => b.scores.B - a.scores.B);
  const person = params.kind === "high" ? sorted[0] : sorted[Math.floor(sorted.length * 0.7)];

  return (
    <>
      <DemoNotice />
      <ReportView
        result={demoResultRow(person, questionnaire)}
        subjectName={person.name}
        subjectEmpId={person.empId}
        companyName={DEMO_COMPANY}
        backHref="/demo"
        backLabel="サンプル一覧へ"
        demo
      />
    </>
  );
}
