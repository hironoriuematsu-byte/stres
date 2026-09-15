import React from "react";

// ロゴ(マーク + mestate)の下に「うえまつ産業医事務所」を文字で表示する。
// 画像に焼き込まれていた事務所名は小さすぎたため、文字として出して大きさを調整できるようにした。
//   markHeight: マーク+mestate 画像の高さ
//   textSize:   事務所名の文字サイズ
export function BrandLogo({
  markHeight = 46,
  textSize = 10,
}: {
  markHeight?: number | string;
  textSize?: number | string;
}) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="mestate" style={{ height: markHeight, width: "auto", display: "block" }} />
      <span
        style={{
          fontSize: textSize,
          fontWeight: 700,
          color: "#4E4C4C",
          letterSpacing: "0.06em",
          marginTop: 2,
          whiteSpace: "nowrap",
        }}
      >
        うえまつ産業医事務所
      </span>
    </span>
  );
}
