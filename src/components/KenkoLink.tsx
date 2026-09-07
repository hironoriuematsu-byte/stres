"use client";

import { Btn } from "@/components/ui";
import { KENKO_URL } from "@/lib/org";

// 健康管理Webへの導線。
// - 環境変数 NEXT_PUBLIC_KENKO_URL が未設定なら何も表示しない
// - 企業ごとの利用フラグ(companies.hm_enabled)が false なら表示しない
// ストレスチェックWeb自体は健康管理Webに依存せず、単独で動作する。
export function KenkoLink({ enabled }: { enabled?: boolean }) {
  if (!KENKO_URL || !enabled) return null;
  return (
    <a href={KENKO_URL} target="_blank" rel="noopener noreferrer">
      <Btn tone="ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
        🩺 健康管理Web
      </Btn>
    </a>
  );
}
