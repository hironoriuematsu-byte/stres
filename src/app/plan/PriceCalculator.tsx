"use client";

import { useState } from "react";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { MIN_TOTAL_SEATS, priceNew, QUOTE_MAILTO, WEB_MAX_SEATS, seatsGranted } from "@/lib/plan";

// 宣伝ページの料金計算(受検予定人数を入れると金額が出る)
export function PriceCalculator() {
  const [text, setText] = useState("30");
  const n = Number(text.normalize("NFKC"));
  const quote = Number.isInteger(n) && n > WEB_MAX_SEATS; // 300名を超える場合はお見積り
  const valid = Number.isInteger(n) && n >= 1 && !quote;
  const price = valid ? priceNew(n) : null;

  return (
    <div style={{ background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 12, padding: "14px 16px" }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink }}>
        受検予定人数
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="numeric"
          style={{ width: 90, margin: "0 6px 0 10px", padding: "6px 8px", fontSize: 16, border: `1px solid ${brand.line}`, borderRadius: 8, textAlign: "right" }}
        />
        名
      </label>
      <div style={{ marginTop: 10, fontSize: 14, color: brand.ink }}>
        {price ? (
          <>
            お支払い金額 <strong style={{ fontSize: 24, color: brand.tealDark }}>{price.total.toLocaleString()}円</strong>（税込）
            <div style={{ fontSize: 12, color: "#5B6B6A", marginTop: 4 }}>
              {n < MIN_TOTAL_SEATS
                ? `最低料金です（${seatsGranted(n)}名まで受検できます）`
                : `330円 × ${n}名`}
            </div>
          </>
        ) : (
          quote ? (
            <span style={{ fontSize: 14 }}>
              {WEB_MAX_SEATS}名を超える場合は個別にお見積りします(割引があります)。
              <a href={QUOTE_MAILTO} style={{ color: brand.tealDark, fontWeight: 700 }}>
                お見積りのご依頼(メール)
              </a>
            </span>
          ) : (
            <span style={{ color: "#B02A2A", fontSize: 13 }}>人数を数字で入力してください</span>
          )
        )}
      </div>
      <div style={{ marginTop: 12, display: quote ? "none" : "block" }}>
        <Link
          href={valid ? `/plan/apply?seats=${n}` : "/plan/apply"}
          style={{ display: "inline-block", background: brand.orange, color: "#fff", borderRadius: 10, padding: "10px 20px", fontWeight: 700, fontSize: 15, textDecoration: "none" }}
        >
          この人数で申し込む
        </Link>
      </div>
    </div>
  );
}
