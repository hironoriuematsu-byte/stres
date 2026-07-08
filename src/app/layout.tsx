import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/Header";
import { brand } from "@/components/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "ストレスチェックWeb",
  description: "職業性ストレス簡易調査票(57項目)準拠 ストレスチェックシステム",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    role = profile?.role ?? null;
  }

  return (
    <html lang="ja">
      <body
        style={{
          minHeight: "100vh",
          background: brand.paper,
          fontFamily: "'Meiryo','Hiragino Sans','Yu Gothic',sans-serif",
        }}
      >
        <Header email={user?.email ?? null} role={role} />
        <main style={{ padding: "0 16px 48px" }}>{children}</main>
      </body>
    </html>
  );
}
