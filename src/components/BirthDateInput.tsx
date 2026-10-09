"use client";

import { brand } from "@/lib/brand";
import { parseBirthDateInput } from "@/lib/birth-date";

// 生年月日の入力欄。カレンダーではなく数字で直接入力する(スマホでは数字キーボード)。
// text は入力そのもの、読み取った日付(YYYY-MM-DD)は parseBirthDateInput(text) で得る
export function BirthDateInput({
  text,
  onChange,
  style,
}: {
  text: string;
  onChange: (text: string) => void;
  style?: React.CSSProperties;
}) {
  const parsed = parseBirthDateInput(text);
  const [y, m, d] = parsed ? parsed.split("-").map(Number) : [];
  return (
    <>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例: 19850304（1985年3月4日）"
        maxLength={20}
        style={style}
      />
      {text.trim() !== "" && (
        <p style={{ fontSize: 12, margin: "4px 0 0", color: parsed ? brand.tealDark : "#B02A2A" }}>
          {parsed ? `${y}年${m}月${d}日 として登録します` : "日付として読み取れません。数字8けた（例: 19850304）で入力してください。"}
        </p>
      )}
    </>
  );
}
