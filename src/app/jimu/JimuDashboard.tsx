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

const TABS = ["結果一覧", "面接指導申出", "集団分析", "配布URL・QR", "従業員招待"] as const;

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
  const [tab, setTab] = useState<(typeof TABS)[number]>("結果一覧");

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Badge tone="orange">実施事務従事者ダッシュボード</Badge>
            <h2 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 0" }}>{companyName}</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/my">
              <Btn tone="ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
                自分の受検(マイページ)
              </Btn>
            </Link>
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
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 16, flexWrap: "wrap" }}>
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
      </Card>

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
