"use client";

import { brand } from "@/lib/brand";

export type MenuItem<T extends string> = {
  key: T;
  icon: string;
  title: string;
  desc: string;
};

// ログイン直後に個人結果などが表示されないよう、機能選択メニューを最初に表示する
// (外出先・職場での画面の覗き見対策)
export function DashboardMenu<T extends string>({
  items,
  onSelect,
}: {
  items: MenuItem<T>[];
  onSelect: (key: T) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
      {items.map((m) => (
        <button
          key={m.key}
          onClick={() => onSelect(m.key)}
          style={{
            textAlign: "left",
            background: "#fff",
            border: `1px solid ${brand.line}`,
            borderRadius: 14,
            padding: "18px 18px 16px",
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(20,40,38,0.04)",
          }}
        >
          <div style={{ fontSize: 26, lineHeight: 1 }}>{m.icon}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: brand.tealDark, margin: "10px 0 4px" }}>{m.title}</div>
          <div style={{ fontSize: 12, color: "#5B6B6A", lineHeight: 1.6 }}>{m.desc}</div>
        </button>
      ))}
    </div>
  );
}
