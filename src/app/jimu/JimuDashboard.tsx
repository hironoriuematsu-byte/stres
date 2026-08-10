"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { fiscalYearOptions, getFiscalYear } from "@/lib/fiscal";
import { ResultsPanel } from "@/components/ResultsPanel";
import { InterviewPanel } from "@/components/InterviewPanel";
import { GroupAnalysis } from "@/components/GroupAnalysis";
import { UserAdminPanel } from "@/components/UserAdminPanel";
import { CampaignPanel } from "@/components/CampaignPanel";
import { DashboardMenu, MenuItem } from "@/components/DashboardMenu";

const TABS = ["結果一覧", "面接指導申出", "集団分析", "配布URL・QR", "従業員招待"] as const;
type Tab = (typeof TABS)[number];

const MENU_ITEMS: MenuItem<Tab>[] = [
  { key: "結果一覧", icon: "📋", title: "結果一覧", desc: "自社の受検結果の一覧・詳細・CSV出力・再受験対応" },
  { key: "面接指導申出", icon: "🩺", title: "面接指導申出", desc: "産業医面接指導の申出の確認と対応状況の管理" },
  { key: "集団分析", icon: "📊", title: "集団分析", desc: "部署別集計・健康リスク・集団分析報告書" },
  { key: "配布URL・QR", icon: "🔗", title: "配布URL・QR", desc: "従業員に配布する受検用URL・QRコードの確認" },
  { key: "従業員招待", icon: "✉️", title: "従業員招待", desc: "従業員への招待メールの送信(個別・CSV一括)" },
];

export function JimuDashboard({
  companyId,
  companyName,
  companyCode,
}: {
  companyId: string;
  companyName: string;
  companyCode: string;
}) {
  const years = fiscalYearOptions();
  const [year, setYear] = useState(getFiscalYear());
  // 覗き見対策: ログイン直後は結果を表示せず、メニュー画面から選択する
  const [tab, setTab] = useState<Tab | null>(null);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Badge tone="orange">実施事務従事者ダッシュボード</Badge>
            <h2 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 0" }}>
              {tab === null ? `${companyName} メニュー` : companyName}
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/my">
              <Btn tone="ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
                自分の受検(マイページ)
              </Btn>
            </Link>
            {tab !== null && (
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                style={{ padding: "8px 10px", fontSize: 14, border: `1px solid ${brand.line}`, borderRadius: 9 }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}年度
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        {tab === null ? (
          <p style={{ fontSize: 13, color: "#5B6B6A", margin: "10px 0 0", lineHeight: 1.7 }}>
            利用する機能を選択してください(結果などの情報は、選択するまで表示されません)。
          </p>
        ) : (
          <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
            <button
              onClick={() => setTab(null)}
              style={{
                background: "#fff",
                color: brand.ink,
                border: `1px solid ${brand.line}`,
                borderRadius: 999,
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ≡ メニュー
            </button>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? brand.teal : "#fff",
                  color: tab === t ? "#fff" : brand.tealDark,
                  border: `1px solid ${brand.teal}`,
                  borderRadius: 999,
                  padding: "7px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </Card>

      {tab === null && <DashboardMenu items={MENU_ITEMS} onSelect={setTab} />}
      {tab === "結果一覧" && <ResultsPanel companyId={companyId} companyName={companyName} fiscalYear={year} />}
      {tab === "面接指導申出" && <InterviewPanel companyId={companyId} companyName={companyName} />}
      {tab === "集団分析" && (
        <GroupAnalysis companyId={companyId} fiscalYear={year} reportHref={`/group-report/${companyId}/${year}`} />
      )}
      {tab === "配布URL・QR" && (
        <CampaignPanel companyId={companyId} companyName={companyName} fiscalYear={year} manage={false} />
      )}
      {tab === "従業員招待" && <UserAdminPanel fixedCompany={{ code: companyCode, name: companyName }} />}
    </div>
  );
}
