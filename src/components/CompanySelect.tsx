"use client";

import { useMemo, useRef, useState } from "react";
import { brand } from "@/lib/brand";
import { Company } from "@/lib/types";

// 実施者は多数の企業を扱うため、
//  - 既定では企業を選ばない(誤って別の企業を開かないようにする)
//  - 企業名・企業コードで検索して選ぶ
// という方式にする。
export function CompanySelect({
  companies,
  value,
  onChange,
  autoOpen = false,
  label = "企業",
}: {
  companies: Company[];
  value: string;
  onChange: (id: string) => void;
  autoOpen?: boolean; // 未選択のとき最初から検索欄を開いておく
  label?: string; // 見出しを別に置く場合は "" を渡す
}) {
  const selected = companies.find((c) => c.id === value);
  const [open, setOpen] = useState(autoOpen && !selected);
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const key = q.trim().toLowerCase();
    const list = key
      ? companies.filter(
          (c) => c.name.toLowerCase().includes(key) || (c.code ?? "").toLowerCase().includes(key)
        )
      : companies;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [companies, q]);

  const pick = (id: string) => {
    onChange(id);
    setQ("");
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: selected ? "#fff" : "#FBF3E3",
          color: selected ? brand.ink : "#8A6B2E",
          border: `1px solid ${selected ? brand.line : "#EFD9A8"}`,
          borderRadius: 9,
          padding: "8px 12px",
          fontSize: 14,
          fontWeight: 700,
          cursor: "pointer",
          maxWidth: 320,
        }}
      >
        {label && <span style={{ fontSize: 12, fontWeight: 400, color: "#8A9694" }}>{label}</span>}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.name : "選択してください"}
        </span>
        <span style={{ fontSize: 11, color: "#8A9694" }}>▼</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 6px)",
            left: 0,
            width: 320,
            maxWidth: "80vw",
            background: "#fff",
            border: `1px solid ${brand.line}`,
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(20,40,38,0.14)",
            padding: 10,
          }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="企業名・企業コードで検索"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              fontSize: 14,
              border: `1px solid ${brand.line}`,
              borderRadius: 8,
              marginBottom: 8,
            }}
          />
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {hits.length === 0 ? (
              <p style={{ fontSize: 13, color: "#8A9694", margin: "6px 4px" }}>該当する企業がありません</p>
            ) : (
              hits.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pick(c.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: c.id === value ? "#EDF6F5" : "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 13.5,
                    color: brand.ink,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{c.name}</span>
                  {c.code && <span style={{ color: "#8A9694", fontSize: 12, marginLeft: 8 }}>{c.code}</span>}
                </button>
              ))
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: "#8A9694" }}>{hits.length}社</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                background: "#fff",
                border: `1px solid ${brand.line}`,
                borderRadius: 8,
                padding: "5px 12px",
                fontSize: 12.5,
                cursor: "pointer",
                color: brand.ink,
              }}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
