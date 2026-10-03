"use client";

import { suggestEmail } from "@/lib/email-domain";

// メールアドレスのドメインが入力ミスらしいとき(例: ezweb.nb.jp)に、修正候補を表示するヒント。
// 「この候補に直す」で入力欄を置き換える
export function EmailTypoHint({ email, onFix }: { email: string; onFix: (fixed: string) => void }) {
  const fixed = suggestEmail(email);
  if (!fixed) return null;
  return (
    <p
      style={{
        fontSize: 12,
        color: "#8A6B2E",
        background: "#FBF3E3",
        border: "1px solid #EFD9A8",
        borderRadius: 8,
        padding: "8px 10px",
        margin: "6px 0 0",
        lineHeight: 1.7,
      }}
    >
      もしかして「{fixed}」ではありませんか？{" "}
      <button
        type="button"
        onClick={() => onFix(fixed)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          color: "#8A6B2E",
          fontWeight: 700,
          textDecoration: "underline",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        この候補に直す
      </button>
    </p>
  );
}
