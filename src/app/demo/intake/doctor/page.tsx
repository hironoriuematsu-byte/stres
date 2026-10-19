"use client";

import Link from "next/link";
import { DemoNotice } from "@/app/demo/DemoNotice";
import { Card } from "@/components/ui";
import { IntakeReview } from "@/components/IntakeReview";
import { brand } from "@/lib/brand";
import { DEMO_REPLY_FROM_DOCTOR, DEMO_SUMMARY, DEMO_TRANSCRIPT } from "../script";

// 紹介用デモ: 事前問診の要約・会話記録・返信の下書き(医師=実施者の画面)
export default function DemoIntakeDoctorPage() {
  return (
    <>
      <DemoNotice />
      <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gap: 14 }}>
        <Card>
          <h1 style={{ fontSize: 18, color: brand.ink, margin: "0 0 4px" }}>面接指導申出の一覧(医師の画面)</h1>
          <p style={{ fontSize: 13, color: "#5B6B6A", margin: 0, lineHeight: 1.7 }}>
            申出の行の「事前問診」を開いたところです。要約・会話の記録・本人への返信の下書きを確認し、直してから本人に送ります。
            この画面は実施者(医師)だけが見られ、会社の担当者には表示されません。
          </p>
        </Card>
        <IntakeReview
          demo
          personName="山田 太郎"
          onChanged={() => {}}
          intake={{
            id: "demo",
            request_id: "demo",
            company_id: "demo",
            status: "completed",
            risk_level: "moderate",
            messages: DEMO_TRANSCRIPT,
            summary: DEMO_SUMMARY,
            reply_draft: DEMO_REPLY_FROM_DOCTOR,
            reply: null,
            reply_sent_at: null,
            share_consent: { keys: ["work", "wishes"], note: "上司には、自分から相談したことを伏せてほしい", at: "2026-10-17T10:00:00+09:00" },
            company_share_draft:
              "面接指導の申出があり、面談の準備のため本人の同意を得た範囲で共有します。\n・4月から担当案件が増えて締め切りが重なり、時間外労働は月45〜80時間の状況です。\n・担当の見直しや締め切りの調整を希望しています。\n面談の日程調整にご協力ください。職場での配慮の内容は、面談後に医師から意見をお伝えします。",
          }}
        />
        <Link href="/demo/intake" style={{ color: brand.tealDark, fontWeight: 700, fontSize: 13 }}>
          ← 本人の画面のデモに戻る
        </Link>
      </div>
    </>
  );
}
