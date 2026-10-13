"use client";

import { brand } from "@/lib/brand";

// 「印刷 / PDFとして保存」ボタン(印刷時は表示しない)
export function PrintButton({ label = "印刷 / PDFとして保存" }: { label?: string }) {
  return (
    <button
      className="no-print"
      onClick={() => window.print()}
      style={{ background: brand.teal, color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
    >
      {label}
    </button>
  );
}
