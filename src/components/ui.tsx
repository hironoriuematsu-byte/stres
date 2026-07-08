"use client";

import { CSSProperties, ReactNode } from "react";

export const brand = {
  teal: "#0F9B8E",
  tealDark: "#0B7268",
  orange: "#E8792B",
  ink: "#22333B",
  paper: "#F7FAF9",
  line: "#DCE8E6",
};

export function Badge({
  children,
  tone = "teal",
}: {
  children: ReactNode;
  tone?: "teal" | "orange" | "red" | "gray";
}) {
  const styles: Record<string, CSSProperties> = {
    teal: { background: "#E2F3F1", color: brand.tealDark },
    orange: { background: "#FCEADC", color: "#B45415" },
    red: { background: "#FDE3E3", color: "#B02A2A" },
    gray: { background: "#EEF1F1", color: "#5B6B6A" },
  };
  return (
    <span
      style={{
        ...styles[tone],
        fontSize: 12,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 999,
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}

export function ScoreBar({
  label,
  value,
  max,
  threshold,
}: {
  label: string;
  value: number;
  max: number;
  threshold?: number;
}) {
  const pct = Math.round((value / max) * 100);
  const over = threshold != null && value >= threshold;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
        <span style={{ color: brand.ink, fontWeight: 600 }}>{label}</span>
        <span style={{ color: over ? "#B02A2A" : brand.tealDark, fontWeight: 700 }}>
          {value} / {max}点{threshold != null ? `(基準 ${threshold}点)` : ""}
        </span>
      </div>
      <div style={{ height: 10, background: "#E9F0EF", borderRadius: 999, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            width: pct + "%",
            height: "100%",
            background: over ? "#D64545" : brand.teal,
            borderRadius: 999,
            transition: "width .4s",
          }}
        />
        {threshold != null && (
          <div
            style={{
              position: "absolute",
              left: (threshold / max) * 100 + "%",
              top: 0,
              bottom: 0,
              width: 2,
              background: brand.orange,
            }}
          />
        )}
      </div>
    </div>
  );
}

export function QuestionRow({
  num,
  text,
  options,
  value,
  onChange,
}: {
  num: number;
  text: string;
  options: string[];
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${brand.line}` }}>
      <div style={{ fontSize: 15, color: brand.ink, marginBottom: 10, lineHeight: 1.6 }}>
        <span style={{ color: brand.teal, fontWeight: 700, marginRight: 8, fontVariantNumeric: "tabular-nums" }}>
          {num}.
        </span>
        {text}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 6 }}>
        {options.map((opt, i) => {
          const v = i + 1;
          const sel = value === v;
          return (
            <button
              key={i}
              onClick={() => onChange(v)}
              style={{
                padding: "8px 4px",
                fontSize: 13,
                borderRadius: 8,
                border: sel ? `2px solid ${brand.teal}` : `1px solid ${brand.line}`,
                background: sel ? "#E2F3F1" : "#fff",
                color: sel ? brand.tealDark : "#5B6B6A",
                fontWeight: sel ? 700 : 400,
                cursor: "pointer",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${brand.line}`,
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 1px 3px rgba(15,155,142,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Btn({
  children,
  onClick,
  tone = "teal",
  disabled,
  style,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "teal" | "orange" | "ghost";
  disabled?: boolean;
  style?: CSSProperties;
  type?: "button" | "submit";
}) {
  const bg = tone === "teal" ? brand.teal : tone === "orange" ? brand.orange : "#fff";
  const color = tone === "ghost" ? brand.tealDark : "#fff";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#C9D6D4" : bg,
        color,
        border: tone === "ghost" ? `1px solid ${brand.teal}` : "none",
        borderRadius: 10,
        padding: "11px 22px",
        fontSize: 15,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
