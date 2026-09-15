import React from "react";
import { brand } from "@/lib/brand";

// 印刷・PDF用の共通ヘッダ。
//   左: 帳票名と、受検した企業(事業場)名を大きく表示
//   右: ロゴ(mestate うえまつ産業医事務所)と「ストレスチェックWeb」の表記
// 企業名は帳票を見た人がどの事業場の結果か一目で分かるよう、帳票名より大きく出す
export function PrintHeader({
  title,
  companyName,
  meta,
  note,
}: {
  title: string;
  companyName: string;
  meta?: string; // 年度などの補足(企業名の右に小さく)
  note?: string; // 調査票・実施者などの1行(下段)
}) {
  return (
    <div
      style={{
        borderBottom: `3px solid ${brand.teal}`,
        paddingBottom: 10,
        marginBottom: 14,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#5B6B6A", fontWeight: 700 }}>{title}</div>
        <h1
          style={{
            fontSize: 24,
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
        {note && <p style={{ fontSize: 11, color: "#7A8886", margin: "4px 0 0" }}>{note}</p>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="mestate うえまつ産業医事務所" style={{ height: 56, width: "auto" }} />
        <div style={{ lineHeight: 1.2, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: brand.tealDark, whiteSpace: "nowrap" }}>
            ストレスチェック<span style={{ color: brand.orange }}>Web</span>
          </div>
          <div style={{ fontSize: 10, color: "#7A8886", whiteSpace: "nowrap" }}>職業性ストレス簡易調査票 準拠</div>
        </div>
      </div>
    </div>
  );
}
