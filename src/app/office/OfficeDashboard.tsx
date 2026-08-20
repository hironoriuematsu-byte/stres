"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Company } from "@/lib/types";
import { fiscalYearOptions, getFiscalYear } from "@/lib/fiscal";
import { DashboardMenu, MenuItem } from "@/components/DashboardMenu";

// 各パネルはタブを開いたときに初めて読み込む(初期表示の高速化。
// グラフ描画・QRコード生成などの大きなライブラリを先読みしない)
const panelLoading = () => <Card>読み込み中…</Card>;
const ResultsPanel = dynamic(() => import("@/components/ResultsPanel").then((m) => m.ResultsPanel), { loading: panelLoading, ssr: false });
const InterviewPanel = dynamic(() => import("@/components/InterviewPanel").then((m) => m.InterviewPanel), { loading: panelLoading, ssr: false });
const GroupAnalysis = dynamic(() => import("@/components/GroupAnalysis").then((m) => m.GroupAnalysis), { loading: panelLoading, ssr: false });
const UserAdminPanel = dynamic(() => import("@/components/UserAdminPanel").then((m) => m.UserAdminPanel), { loading: panelLoading, ssr: false });
const AccessLogsPanel = dynamic(() => import("@/components/AccessLogsPanel").then((m) => m.AccessLogsPanel), { loading: panelLoading, ssr: false });
const CampaignPanel = dynamic(() => import("@/components/CampaignPanel").then((m) => m.CampaignPanel), { loading: panelLoading, ssr: false });
const CompanyAdminPanel = dynamic(() => import("@/components/CompanyAdminPanel").then((m) => m.CompanyAdminPanel), { loading: panelLoading, ssr: false });
const DeptAdminPanel = dynamic(() => import("@/components/DeptAdminPanel").then((m) => m.DeptAdminPanel), { loading: panelLoading, ssr: false });

const TABS = ["結果一覧", "面接指導申出", "集団分析", "配布URL・QR", "ユーザー管理", "企業管理", "部署管理", "アクセスログ"] as const;
type Tab = (typeof TABS)[number];

const MENU_ITEMS: MenuItem<Tab>[] = [
  { key: "結果一覧", icon: "📋", title: "結果一覧", desc: "受検結果の一覧・詳細・CSV出力・再受験対応" },
  { key: "面接指導申出", icon: "🩺", title: "面接指導申出", desc: "産業医面接指導の申出の確認と対応状況の管理" },
  { key: "集団分析", icon: "📊", title: "集団分析", desc: "部署別集計・健康リスク・集団分析報告書" },
  { key: "配布URL・QR", icon: "🔗", title: "配布URL・QR", desc: "受検用URL・QRコードの発行・停止・再発行" },
  { key: "ユーザー管理", icon: "✉️", title: "ユーザー管理", desc: "招待・メンバー一覧・ロール変更" },
  { key: "企業管理", icon: "🏢", title: "企業管理", desc: "契約企業の追加・名称変更" },
  { key: "部署管理", icon: "🗂️", title: "部署管理", desc: "受検時に選択できる部署名の登録・編集" },
  { key: "アクセスログ", icon: "📝", title: "アクセスログ", desc: "閲覧・操作の記録の確認" },
];

export function OfficeDashboard({ companies }: { companies: Company[] }) {
  const years = fiscalYearOptions();
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? "");
  const [year, setYear] = useState(getFiscalYear());
  // 覗き見対策: ログイン直後は結果を表示せず、メニュー画面から選択する
  const [tab, setTab] = useState<Tab | null>(null);

  const company = companies.find((c) => c.id === companyId);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Badge tone="orange">実施者(産業医)ダッシュボード</Badge>
            <h2 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 0" }}>
              {tab === null ? "メニュー" : "企業横断管理"}
            </h2>
          </div>
          {tab !== null && (
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
          )}
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

      {tab === null ? (
        <DashboardMenu items={MENU_ITEMS} onSelect={setTab} />
      ) : companies.length === 0 && tab !== "企業管理" ? (
        <Card>
          <p style={{ fontSize: 14, color: "#5B6B6A", margin: 0 }}>
            契約企業が未登録です。「企業管理」タブから企業を追加してください。
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
          {tab === "集団分析" && company && (
            <GroupAnalysis companyId={company.id} fiscalYear={year} reportHref={`/group-report/${company.id}/${year}`} />
          )}
          {tab === "配布URL・QR" && company && (
            <CampaignPanel companyId={company.id} companyName={company.name} fiscalYear={year} manage />
          )}
          {tab === "ユーザー管理" && <UserAdminPanel companies={companies} />}
          {tab === "企業管理" && <CompanyAdminPanel companies={companies} />}
          {tab === "部署管理" && company && <DeptAdminPanel companyId={company.id} companyName={company.name} />}
          {tab === "アクセスログ" && <AccessLogsPanel />}
        </>
      )}
    </div>
  );
}
