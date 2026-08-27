import type { Metadata } from "next";
import { getSessionProfile } from "@/lib/auth-server";
import { Header } from "@/components/Header";
import { AutoLogout } from "@/components/AutoLogout";
import { DomSafety } from "@/components/DomSafety";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "ストレスチェックWeb",
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
          Copyright © Mestate LLC All Rights Reserved.
        </footer>
      </body>
    </html>
  );
}
