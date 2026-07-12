import type { Metadata } from "next";
import { getSessionProfile } from "@/lib/auth-server";
import { Header } from "@/components/Header";
import { brand } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: "ストレスチェックWeb",
  description: "職業性ストレス簡易調査票(57項目)準拠 ストレスチェックシステム",
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
        <div style={{ padding: "0 16px" }}>
          <Header email={user?.email ?? null} role={profile?.role ?? null} name={profile?.name ?? null} />
        </div>
        <main style={{ padding: "0 16px 48px" }}>{children}</main>
      </body>
    </html>
  );
}
