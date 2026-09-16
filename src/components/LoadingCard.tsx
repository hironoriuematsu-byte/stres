"use client";

import { CSSProperties, useEffect } from "react";
import { Card } from "@/components/ui";
import { startNavigationProgress, stopNavigationProgress } from "@/lib/navigate";

// 「読み込み中…」の表示。表示している間は画面上端の進行バー(NavigationProgress)も出す。
// ダッシュボードのタブ切り替えやマイページのように、URLが変わらずにデータを取りに行く場面で、
// 押した直後から反応があることを全ロール共通で示すために使う
export function LoadingCard({ style, plain = false }: { style?: CSSProperties; plain?: boolean }) {
  useEffect(() => {
    startNavigationProgress();
    return () => stopNavigationProgress();
  }, []);
  if (plain) return <div style={style}>読み込み中…</div>;
  return <Card style={style}>読み込み中…</Card>;
}
