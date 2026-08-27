"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

// 紹介用デモ: 産業医面接指導の申出フォーム(送信はされない)
export function DemoInterviewForm() {
  const [message, setMessage] = useState("");
  const [agree, setAgree] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Card style={{ maxWidth: 720, margin: "0 auto" }}>
        <Badge>申出の完了画面(サンプル)</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 8px" }}>
          産業医面接指導の申出を受け付けました
        </h2>
        <div
          style={{
            fontSize: 13.5,
            color: brand.tealDark,
            background: "#E2F3F1",
            borderRadius: 10,
            padding: "12px 14px",
            lineHeight: 1.9,
          }}
        >
          面接指導の申出を送信し、実施者へ通知しました。受付確認メールをあなた宛にもお送りしましたのでご確認ください。
        </div>
        <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.9, marginTop: 14 }}>
          実際の運用では、この時点で次の3方向にメールが自動送信されます:
        </p>
        <ul style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.9, paddingLeft: 20, margin: "4px 0 0" }}>
          <li>申出した本人 — 申出内容を含む受付確認メール</li>
          <li>実施者(産業医) — 申出があった旨の通知(本文に個人情報は含みません)</li>
          <li>会社の実施事務従事者 — 同上</li>
        </ul>
        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <Btn tone="ghost" onClick={() => setSent(false)}>
            もう一度見る
          </Btn>
          <Link href="/demo">
            <Btn>サンプル一覧へ</Btn>
          </Link>
        </div>
        <p style={{ fontSize: 12, color: "#8A9694", marginTop: 14, lineHeight: 1.7 }}>
          ※ デモのため、実際にはメールは送信されていません。
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 720, margin: "0 auto" }}>
      <Badge tone="red">高ストレス</Badge>
      <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 6px" }}>産業医面接指導の申出(サンプル)</h2>
      <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.9, margin: "0 0 14px" }}>
        高ストレスと判定された方は、マイページからこの申出フォームを開いて、医師(産業医)による面接指導を申し出ることができます。
        受検直後の結果画面にある「面接指導を申し出る」からは、このフォームが開いた状態で表示されます。
      </p>

      <div style={{ border: `1px solid ${brand.line}`, borderRadius: 10, padding: 14 }}>
        <h4 style={{ fontSize: 14, color: brand.ink, margin: "0 0 10px" }}>産業医面接指導の申出</h4>
        <label style={{ fontSize: 12, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 4 }}>
          相談したいこと・連絡事項(任意)
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="例: 最近眠れない日が続いています。仕事量について相談したいです。"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "8px 10px",
            fontSize: 14,
            border: `1px solid ${brand.line}`,
            borderRadius: 8,
            marginBottom: 12,
            fontFamily: "inherit",
          }}
        />
        <div
          style={{
            fontSize: 12.5,
            color: "#8A6B2E",
            background: "#FBF3E3",
            border: "1px solid #EFD9A8",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 12,
            lineHeight: 1.8,
          }}
        >
          <strong>申出の前にご確認ください:</strong>{" "}
          面接指導の申出を行うと、厚生労働省の指針により、あなたのストレスチェック結果を事業者(会社)へ提供することに同意したものとみなされます。
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8, cursor: "pointer", color: brand.ink }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontWeight: 700 }}>
              ストレスチェック結果を事業者(会社)へ提供することに同意して、面接指導を申し出ます
            </span>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/demo">
            <Btn tone="ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
              キャンセル
            </Btn>
          </Link>
          <Btn tone="orange" onClick={() => setSent(true)} disabled={!agree} style={{ padding: "8px 14px", fontSize: 13 }}>
            申出を送信する
          </Btn>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#8A9694", marginTop: 14, lineHeight: 1.8 }}>
        ※ 申出を理由とする不利益な取り扱いは法律で禁止されています。
        デモのため、送信しても実際には申出は登録されず、メールも送信されません。
      </p>
    </Card>
  );
}
