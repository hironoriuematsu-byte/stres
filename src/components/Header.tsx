"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/components/ui";

export function Header({
  email,
  role,
}: {
  email: string | null;
  role: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const roleLabel =
    role === "office" ? "産業医事務所" : role === "company_hr" ? "企業人事担当者" : role === "employee" ? "従業員" : null;

  return (
    <header
      style={{
        maxWidth: 900,
        margin: "0 auto",
        padding: "26px 0 22px",
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        flexWrap: "wrap",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: brand.tealDark, cursor: "pointer" }}>
            ストレスチェック<span style={{ color: brand.orange }}>Web</span>
          </div>
        </Link>
        <div style={{ fontSize: 12, color: "#7A8886" }}>
          職業性ストレス簡易調査票(57項目)準拠 / うえまつ産業医事務所
        </div>
      </div>
      {email && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#5B6B6A" }}>
          <span>
            {roleLabel ? `${roleLabel} / ` : ""}
            {email}
          </span>
          <button
            onClick={signOut}
            style={{
              background: "#fff",
              border: `1px solid ${brand.line}`,
              borderRadius: 8,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              color: brand.tealDark,
              cursor: "pointer",
            }}
          >
            ログアウト
          </button>
        </div>
      )}
    </header>
  );
}
