import { ExamForm } from "@/app/exam/ExamForm";
import { DemoNotice } from "@/app/demo/DemoNotice";
import { DEMO_COMPANY } from "@/lib/demo-data";

export const metadata = {
  title: "受検の流れ(デモ) | ストレスチェックWeb",
};

// 紹介用デモ: 実際の受検画面をそのまま体験できる(回答は保存されない)
export default function DemoExamPage() {
  return (
    <>
      <DemoNotice />
      <ExamForm
        demo
        profile={{
          userId: "demo-user",
          name: "",
          empId: "",
          dept: "",
          companyId: "demo-company",
          companyName: DEMO_COMPANY,
        }}
        departments={["製造部", "営業部", "開発部", "管理部", "品質保証部"]}
      />
    </>
  );
}
