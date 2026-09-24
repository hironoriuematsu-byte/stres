import React from "react";
import { brand } from "@/lib/brand";
import { questionnaireCompliance } from "@/lib/questionnaire-label";

// 印刷・PDF用の共通ヘッダ。
//   左: 帳票名と、受検した企業(事業場)名を大きく表示
//   右: ロゴ(mestate うえまつ産業医事務所)と「ストレスチェックWeb」の表記
// 企業名は帳票を見た人がどの事業場の結果か一目で分かるよう、帳票名より大きく出す
export function PrintHeader({
  title,
  companyName,
  meta,
  note,
  questionnaire,
}: {
  title: string;
  companyName: string;
  meta?: string; // 年度などの補足(企業名の右に小さく)
  note?: string; // 調査票・実施者などの補足(下段)。改行(\n)を入れるとその位置で行を分ける
  questionnaire?: "57" | "80"; // 企業が採用した調査票の版。ロゴ横の「〜 準拠」表記を切り替える(未指定は57項目)
}) {
  // 段組みは globals.css の .print-header 系で定義(スマホ幅ではロゴ行を上に置いて縦積みにし、
  // 印刷時は左右2段組みに戻す)。ここでは色・余白などの見た目だけを指定する
  // 企業名は長いほど文字を小さくして、A4の印刷幅(ロゴの左側 約430px)でも1行に収める
  const nameLen = [...companyName].length;
  const nameSize = nameLen <= 12 ? 24 : nameLen <= 18 ? 20 : nameLen <= 24 ? 17 : 15;
  return (
    <div
      className="print-header"
      style={{
        borderBottom: `3px solid ${brand.teal}`,
        paddingBottom: 10,
        marginBottom: 14,
      }}
    >
      <div className="print-header-main">
        <div style={{ fontSize: 13, color: "#5B6B6A", fontWeight: 700 }}>{title}</div>
        <h1
          className="print-header-company"
          style={{
            fontSize: nameSize,
            fontWeight: 700,
            color: brand.ink,
            margin: "2px 0 0",
            lineHeight: 1.3,
            wordBreak: "break-word",
          }}
        >
          {companyName}
          {meta && (
            <span style={{ fontSize: 14, fontWeight: 700, color: "#5B6B6A", marginLeft: 10 }}>
              {meta}
            </span>
          )}
        </h1>
        {note && (
          <p style={{ fontSize: 11, color: "#7A8886", margin: "4px 0 0", lineHeight: 1.6, whiteSpace: "pre-line" }}>
            {note}
          </p>
        )}
      </div>
      <div className="print-header-logo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="mestate うえまつ産業医事務所" style={{ height: 56, width: "auto" }} />
        <div style={{ lineHeight: 1.2, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: brand.tealDark, whiteSpace: "nowrap" }}>
            ストレスチェック<span style={{ color: brand.orange }}>Web</span>
          </div>
          <div style={{ fontSize: 10, color: "#7A8886", whiteSpace: "nowrap" }}>{questionnaireCompliance(questionnaire === "80")}</div>
        </div>
      </div>
    </div>
  );
}
