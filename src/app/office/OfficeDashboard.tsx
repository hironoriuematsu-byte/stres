"use client";

import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Company } from "@/lib/types";
import { fiscalYearOptions } from "@/lib/fiscal";
import { ResultsPanel } from "@/components/ResultsPanel";
import { InterviewPanel } from "@/components/InterviewPanel";
import { GroupAnalysis } from "@/components/GroupAnalysis";
import { UserAdminPanel } from "@/components/UserAdminPanel";
import { AccessLogsPanel } from "@/components/AccessLogsPanel";
import { CampaignPanel } from "@/components/CampaignPanel";

const TABS = ["結果一覧", "面接指導申出", "集団分析", "配布URL・QR", "ユーザー管理", "アクセスログ"] as const;

export function OfficeDashboard({ companies }: { companies: Company[] }) {
  const years = fiscalYearOptions();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [year, setYear] = useState(years[0]);
  const [tab, setTab] = useState<(typeof TABS)[number]>("結果一覧");

  const company = companies.find((c) => c.id === companyId);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Badge tone="orange">実施者(産業医事務所)ダッシュボード</Badge>
            <h2 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 0" }}>企業横断管理</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              style={{ padding: "8px 10px", fontSize: 14, border: `1px solid ${brand.line}`, borderRadius: 9 }}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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

      {companies.length === 0 ? (
        <Card>
          <p style={{ fontSize: 14, color: "#5B6B6A", margin: 0 }}>
            契約企業が未登録です。SupabaseのTable Editorで companies に企業(name, code)を登録してください。
          </p>
        </Card>
      ) : (
        <>
          {tab === "結果一覧" && company && (
            <ResultsPanel companyId={company.id} companyName={company.name} fiscalYear={year} />
          )}
          {tab === "面接指導申出" && company && (
            <InterviewPanel companyId={company.id} companyName={company.name} />
          )}
          {tab === "集団分析" && company && <GroupAnalysis companyId={company.id} fiscalYear={year} />}
          {tab === "配布URL・QR" && company && (
            <CampaignPanel companyId={company.id} companyName={company.name} fiscalYear={year} manage />
          )}
          {tab === "ユーザー管理" && <UserAdminPanel companies={companies} />}
          {tab === "アクセスログ" && <AccessLogsPanel />}
        </>
      )}
    </div>
  );
}
