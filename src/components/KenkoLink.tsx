"use client";

import { Btn } from "@/components/ui";
import { KENKO_URL } from "@/lib/org";

// 健康管理Webへの導線。
// - 環境変数 NEXT_PUBLIC_KENKO_URL が未設定なら何も表示しない
// - 企業ごとの利用フラグ(companies.hm_enabled)が false なら表示しない
// ストレスチェックWeb自体は健康管理Webに依存せず、単独で動作する。
export function KenkoLink({ enabled, label }: { enabled?: boolean; label?: string }) {
  if (!KENKO_URL || !enabled) return null;
  // label を渡した場合は、主たる導線として少し大きく表示する
  const primary = Boolean(label);
  return (
    <a href={KENKO_URL} target="_blank" rel="noopener noreferrer">
      <Btn
        tone={primary ? "teal" : "ghost"}
        style={primary ? { padding: "11px 20px", fontSize: 15 } : { padding: "8px 14px", fontSize: 13 }}
      >
        🩺 {label ?? "健康管理Web"}
      </Btn>
    </a>
  );
}
