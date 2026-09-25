"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { Company } from "@/lib/types";
import { fiscalYearOptions, getFiscalYear } from "@/lib/fiscal";
import { DashboardMenu, MenuItem } from "@/components/DashboardMenu";
import { CompanySelect } from "@/components/CompanySelect";
import { KenkoLink } from "@/components/KenkoLink";
import { LoadingCard } from "@/components/LoadingCard";

// 各パネルはタブを開いたときに初めて読み込む(初期表示の高速化。
// グラフ描画・QRコード生成などの大きなライブラリを先読みしない)
// タブの部品を読み込む間も、上端の進行バーを出す(LoadingCard が表示中に出す)
const panelLoading = () => <LoadingCard />;
const ResultsPanel = dynamic(() => import("@/components/ResultsPanel").then((m) => m.ResultsPanel), { loading: panelLoading, ssr: false });
const InterviewPanel = dynamic(() => import("@/components/InterviewPanel").then((m) => m.InterviewPanel), { loading: panelLoading, ssr: false });
// 集団分析タブには報告書そのもの(部署別集計・判定図・健康リスク)を直接表示する
const GroupReportView = dynamic(
  () => import("@/app/group-report/[companyId]/[year]/GroupReportView").then((m) => m.GroupReportView),
  { loading: panelLoading, ssr: false }
);
const UserAdminPanel = dynamic(() => import("@/components/UserAdminPanel").then((m) => m.UserAdminPanel), { loading: panelLoading, ssr: false });
const AccessLogsPanel = dynamic(() => import("@/components/AccessLogsPanel").then((m) => m.AccessLogsPanel), { loading: panelLoading, ssr: false });
const CampaignPanel = dynamic(() => import("@/components/CampaignPanel").then((m) => m.CampaignPanel), { loading: panelLoading, ssr: false });
const CompanyAdminPanel = dynamic(() => import("@/components/CompanyAdminPanel").then((m) => m.CompanyAdminPanel), { loading: panelLoading, ssr: false });
const DeptAdminPanel = dynamic(() => import("@/components/DeptAdminPanel").then((m) => m.DeptAdminPanel), { loading: panelLoading, ssr: false });

// 企業を選ばないと表示できないタブ(ユーザー管理・企業管理・ログは企業横断)
const NEEDS_COMPANY: readonly string[] = ["結果一覧", "面接指導申出", "集団分析", "配布URL・QR", "部署管理"];

const TABS = ["結果一覧", "面接指導申出", "集団分析", "配布URL・QR", "ユーザー管理", "企業管理", "部署管理", "ログ"] as const;
type Tab = (typeof TABS)[number];

const MENU_ITEMS: MenuItem<Tab>[] = [
  { key: "結果一覧", icon: "📋", title: "結果一覧", desc: "受検結果の一覧・詳細・CSV出力・再受検対応" },
  { key: "面接指導申出", icon: "🩺", title: "面接指導申出", desc: "産業医面接指導の申出の確認と対応状況の管理" },
  { key: "集団分析", icon: "📊", title: "集団分析", desc: "部署別集計・健康リスク・集団分析報告書" },
  { key: "配布URL・QR", icon: "🔗", title: "配布URL・QR", desc: "受検用URL・QRコードの発行・停止・再発行" },
  { key: "ユーザー管理", icon: "✉️", title: "ユーザー管理", desc: "招待・メンバー一覧・ロール変更" },
  { key: "企業管理", icon: "🏢", title: "企業管理", desc: "契約企業の追加・名称変更" },
  { key: "部署管理", icon: "🗂️", title: "部署管理", desc: "受検時に選択できる部署名の登録・編集" },
  { key: "ログ", icon: "📝", title: "ログ", desc: "閲覧・操作の記録(アクセスログ)の確認" },
];

export function OfficeDashboard({ companies }: { companies: Company[] }) {
  const years = fiscalYearOptions();
  // 既定では企業を選ばない(誤って別の企業の結果を開かないようにするため)
  const [companyId, setCompanyId] = useState("");
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
            {/* 選択中の企業(事業場)名を大きく表示し、どの企業の画面かを明確にする */}
            {tab !== null && company && (
              <div style={{ fontSize: 12, color: "#5B6B6A", marginTop: 10 }}>選択中の事業場</div>
            )}
            <h2
              style={{
                fontSize: tab !== null && company ? 26 : 20,
                color: brand.ink,
                margin: tab !== null && company ? "0" : "10px 0 0",
                lineHeight: 1.3,
              }}
            >
              {tab === null ? "メニュー" : company ? company.name : "企業横断管理（企業を選択してください）"}
            </h2>
          </div>
          {/* 健康管理Webへの導線は実施者には常に出す(以前は「健康管理Web併用の企業を選んでいるとき」だけ
              表示していたため、併用していない企業を選ぶと消えて戸惑いがあった)。
              企業の選択と年度はタブを開いているときだけ表示する */}
          {tab === null ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <KenkoLink enabled />
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <CompanySelect companies={companies} value={companyId} onChange={setCompanyId} />
              <KenkoLink enabled />
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
                  padding: "7px 13px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
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
      ) : NEEDS_COMPANY.includes(tab) && !company ? (
        <Card>
          <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>企業を選択してください</h3>
          <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>
            「{tab}」は企業ごとの画面です。誤って別の企業を開かないよう、既定では企業を選んでいません。
            下の欄から対象の企業をお選びください(企業名・企業コードで検索できます)。
          </p>
          <CompanySelect companies={companies} value={companyId} onChange={setCompanyId} autoOpen />
        </Card>
      ) : (
        <>
          {tab === "結果一覧" && company && (
            <ResultsPanel companyId={company.id} companyName={company.name} fiscalYear={year} questionnaire={company.questionnaire ?? "57"} />
          )}
          {tab === "面接指導申出" && company && (
            <InterviewPanel companyId={company.id} companyName={company.name} />
          )}
          {tab === "集団分析" && company && (
            <GroupReportView companyId={company.id} companyName={company.name} fiscalYear={year} embedded formHref={`/stress-report/${company.id}/${year}`} />
          )}
          {tab === "配布URL・QR" && company && (
            <CampaignPanel companyId={company.id} companyName={company.name} fiscalYear={year} manage />
          )}
          {/* key: 上部で企業を切り替えたら、招待先・メンバー一覧も選び直した状態にする */}
          {tab === "ユーザー管理" && (
            <UserAdminPanel key={companyId} companies={companies} defaultCompanyId={companyId} />
          )}
          {tab === "企業管理" && <CompanyAdminPanel companies={companies} />}
          {tab === "部署管理" && company && <DeptAdminPanel companyId={company.id} companyName={company.name} />}
          {tab === "ログ" && <AccessLogsPanel />}
        </>
      )}
    </div>
  );
}
