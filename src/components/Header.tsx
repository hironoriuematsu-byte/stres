"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";
import { ROLE_LABEL, Role } from "@/lib/types";

export function Header({
  email,
  role,
  name,
}: {
  email: string | null;
  role: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // アカウント設定ページでは「アカウント設定」タブの代わりに戻り先を表示する
  const onAccountPage = pathname.startsWith("/account");
  const homeHref = role === "employee" ? "/my" : role === "jimu" ? "/jimu" : role === "office" ? "/office" : "/";
  const homeLabel = role === "employee" ? "マイページ" : "ダッシュボード";

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const roleLabel = role && role in ROLE_LABEL ? ROLE_LABEL[role as Role] : null;

  return (
    <header
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "20px 0 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="mestate うえまつ産業医事務所"
            // 画面幅が狭いときはロゴと題字を少し小さくして1行に収める
            style={{ height: "clamp(40px, 12vw, 54px)", width: "auto", display: "block" }}
          />
          <div
            style={{
              fontSize: "clamp(16px, 5vw, 22px)",
              fontWeight: 800,
              color: brand.tealDark,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            ストレスチェック<span style={{ color: brand.orange }}>Web</span>
          </div>
        </Link>
        <div style={{ fontSize: 12, color: "#7A8886" }}>
          職業性ストレス簡易調査票 準拠 / うえまつ産業医事務所
        </div>
      </div>
      {email && (
        // スマートフォンの幅では氏名とボタンが行を分けて並ぶ。
        // 氏名やボタンの文字が途中で折り返さないようにする
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            rowGap: 8,
            fontSize: 13,
            color: "#5B6B6A",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "100%",
            }}
          >
            {roleLabel ? `${roleLabel} / ` : ""}
            {name || email}
          </span>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link
              href={onAccountPage ? homeHref : "/account"}
              style={{
                background: "#fff",
                border: `1px solid ${brand.line}`,
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 700,
                color: brand.tealDark,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {onAccountPage ? homeLabel : "アカウント設定"}
            </Link>
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
                whiteSpace: "nowrap",
              }}
            >
              ログアウト
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
