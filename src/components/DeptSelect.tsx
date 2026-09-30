"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { brand } from "@/lib/brand";
import { findExactDept, searchDepts } from "@/lib/dept-search";

// 部署の選択欄(検索付き)。
// 部署が数十件ある企業でも、文字を入力すると候補が絞り込まれる。
// 一覧にない部署は「直接入力として使う」で登録できる(従来の「その他(直接入力)」に相当)。
export function DeptSelect({
  options,
  value,
  onChange,
  placeholder = "部署名を入力して検索(一覧から選択)",
  style,
  compact = false,
}: {
  options: string[];
  value: string;
  onChange: (dept: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  compact?: boolean; // 結果一覧の行内など、小さめに表示する
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 外から値が変わったとき(選択の確定や別の行を開いたとき)は表示も合わせる
  useEffect(() => {
    setQ(value);
  }, [value]);

  const hits = useMemo(() => searchDepts(options, q), [options, q]);
  const exact = findExactDept(options, q);
  const isOther = value !== "" && !options.includes(value);
  // 一覧にない名前を使う行は、1文字だけの途中入力では出さない(候補の押し間違いを防ぐ)
  const canUseAsIs = !exact && (q.trim().length >= 2 || (q.trim() !== "" && hits.length === 0));

  // 欄の外をクリックしたら閉じる(入力中の文字が候補と一致していなければ元に戻す)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, value]);

  const pick = (dept: string) => {
    onChange(dept);
    setQ(dept);
    setOpen(false);
    setCursor(-1);
  };

  const close = () => {
    const ex = findExactDept(options, q);
    if (ex) {
      if (ex !== value) onChange(ex);
      setQ(ex);
    } else {
      setQ(value);
    }
    setOpen(false);
    setCursor(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, hits.length - 1 + (canUseAsIs ? 1 : 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (cursor >= 0 && cursor < hits.length) pick(hits[cursor]);
      else if (cursor === hits.length && canUseAsIs) pick(q.trim());
      else if (exact) pick(exact);
      else if (hits.length === 1) pick(hits[0]);
    } else if (e.key === "Escape") {
      close();
    }
  };

  // キーボードで選んでいる行が見えるようにする
  useEffect(() => {
    if (cursor < 0 || !listRef.current) return;
    const el = listRef.current.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const fontSize = compact ? 13 : 15;
  const rowStyle = (active: boolean, selected: boolean): React.CSSProperties => ({
    display: "block",
    width: "100%",
    textAlign: "left",
    background: active ? "#DDEFEC" : selected ? "#EDF6F5" : "#fff",
    border: "none",
    borderRadius: 8,
    padding: compact ? "7px 10px" : "9px 12px",
    fontSize: compact ? 13 : 14,
    color: brand.ink,
    cursor: "pointer",
  });

  return (
    <div ref={wrapRef} style={{ position: "relative", ...style }}>
      <div style={{ position: "relative" }}>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setCursor(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={60}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: compact ? "5px 30px 5px 10px" : "10px 34px 10px 12px",
            fontSize,
            border: `1px solid ${brand.line}`,
            borderRadius: compact ? 8 : 10,
            background: "#fff",
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="候補を開く"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? close() : setOpen(true))}
          style={{
            position: "absolute",
            right: 6,
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            color: "#8A9694",
            fontSize: 11,
            cursor: "pointer",
            padding: 4,
          }}
        >
          ▼
        </button>
      </div>
      {isOther && !open && (
        <p style={{ fontSize: 12, color: "#8A6B2E", margin: "4px 0 0" }}>一覧にない部署名として登録されます。</p>
      )}

      {open && (
        <div
          style={{
            position: "absolute",
            zIndex: 30,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            minWidth: compact ? 240 : undefined,
            background: "#fff",
            border: `1px solid ${brand.line}`,
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(20,40,38,0.14)",
            padding: 6,
          }}
        >
          <div ref={listRef} style={{ maxHeight: 240, overflowY: "auto" }}>
            {hits.map((d, i) => (
              <button
                key={d}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(d)}
                style={rowStyle(cursor === i, d === value)}
              >
                {d}
              </button>
            ))}
            {canUseAsIs && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(q.trim())}
                style={{ ...rowStyle(cursor === hits.length, false), color: "#8A6B2E", borderTop: hits.length ? `1px solid ${brand.line}` : "none", borderRadius: 0 }}
              >
                「{q.trim()}」を直接入力として使う(一覧にない部署)
              </button>
            )}
            {hits.length === 0 && !canUseAsIs && (
              <p style={{ fontSize: 13, color: "#8A9694", margin: "6px 8px" }}>部署がありません</p>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "#8A9694", padding: "6px 8px 2px" }}>
            {q.trim() ? `${hits.length}件が該当` : `${options.length}件。文字を入力すると絞り込めます`}
          </div>
        </div>
      )}
    </div>
  );
}
