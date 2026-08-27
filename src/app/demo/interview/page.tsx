import { DemoNotice } from "@/app/demo/DemoNotice";
import { DemoInterviewForm } from "./DemoInterviewForm";

export const metadata = {
  title: "産業医面接指導の申出(デモ) | ストレスチェックWeb",
};

// 紹介用デモ: 高ストレス者が使う面接指導の申出フォーム(送信されない)
export default function DemoInterviewPage() {
  return (
    <>
      <DemoNotice />
      <DemoInterviewForm />
    </>
  );
}
