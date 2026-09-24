import type { Metadata } from "next";
import { Suspense } from "react";
import { getSessionProfile } from "@/lib/auth-server";
import { Header } from "@/components/Header";
import { AutoLogout } from "@/components/AutoLogout";
import { DomSafety } from "@/components/DomSafety";
import NavigationProgress from "@/components/NavigationProgress";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "うえまつ産業医事務所 ストレスチェックWeb",
    template: "%s | うえまつ産業医事務所 ストレスチェックWeb",
  },
  description: "職業性ストレス簡易調査票 準拠 ストレスチェックシステム",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionProfile();

  return (
    <html lang="ja">
      <body
        style={{
          minHeight: "100vh",
          background: brand.paper,
          fontFamily: "'Meiryo','Hiragino Sans','Yu Gothic',sans-serif",
        }}
      >
        <DomSafety />
        {/* 画面切り替え中の進行バー(useSearchParams を使うため Suspense で包む) */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {user && <AutoLogout />}
        <div style={{ padding: "0 16px" }}>
          <Header email={user?.email ?? null} role={profile?.role ?? null} name={profile?.name ?? null} />
        </div>
        <main style={{ padding: "0 16px 48px" }}>{children}</main>
        <footer
          style={{
            textAlign: "center",
            padding: "20px 16px 28px",
            fontSize: 12,
            color: "#8A9694",
          }}
        >
          {/* リンクと Copyright を別々のかたまりにし、狭い画面では Copyright が2行目に落ちるようにする */}
          <span className="site-footer-item">
            <a href="/privacy" style={{ color: "#5B6B6A", textDecoration: "underline" }}>
              個人情報の取扱いについて
            </a>
            <span className="site-footer-sep" style={{ margin: "0 10px" }}>
              |
            </span>
          </span>
          <span className="site-footer-item">Copyright © Mestate LLC All Rights Reserved.</span>
        </footer>
      </body>
    </html>
  );
}
