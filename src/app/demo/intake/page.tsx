import { DemoNotice } from "@/app/demo/DemoNotice";
import { IntakeChat } from "@/app/intake/[requestId]/IntakeChat";
import { DEMO_REPLY_FROM_DOCTOR, DEMO_STEPS } from "./script";

export const metadata = { title: "面接指導の事前問診(デモ)" };

// 紹介用デモ: 高ストレス者が面接指導を申し出たあとの事前問診(本人の画面)。AIは使わず台本どおりに進む
export default function DemoIntakePage() {
  return (
    <>
      <DemoNotice />
      <IntakeChat requestId="demo" demo={{ steps: DEMO_STEPS, doctorReply: DEMO_REPLY_FROM_DOCTOR, doctorHref: "/demo/intake/doctor" }} />
    </>
  );
}
