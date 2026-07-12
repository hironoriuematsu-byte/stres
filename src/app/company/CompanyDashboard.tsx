"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { fiscalYearOptions } from "@/lib/fiscal";
import { GroupAnalysis } from "@/components/GroupAnalysis";
import { logAccess } from "@/lib/log";

type ConsentedRow = {
  taken_at: string;
  fiscal_year: number;
  name: string;
  emp_id: string | null;
  dept: string;
  high_stress: boolean;
};

export function CompanyDashboard({ companyId, companyName }: { companyId: string; companyName: string }) {
  const years = fiscalYearOptions();
  const [year, setYear] = useState(years[0]);
  const [rows, setRows] = useState<ConsentedRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    setRows(null);
    setErr(null);
    supabase
      .rpc("consented_results", { target_company: companyId, target_year: year })
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        setRows((data as ConsentedRow[]) ?? []);
        logAccess(supabase, "view_results", `${companyName}/${year}(同意分)`, companyId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, year]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Badge tone="gray">事業者担当者ダッシュボード</Badge>
            <h2 style={{ fontSize: 20, color: brand.ink, margin: "10px 0 2px" }}>{companyName}</h2>
            <p style={{ fontSize: 13, color: "#5B6B6A", margin: 0 }}>
              閲覧できるのは集団分析と、本人が提供に同意した個人結果のみです(労働安全衛生法第66条の10)。
            </p>
          </div>
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
      </Card>

      <GroupAnalysis companyId={companyId} fiscalYear={year} />

      <Card>
        <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>
          本人同意のある個人結果({rows?.length ?? 0} 件)
        </h3>
        <p style={{ fontSize: 13, color: "#5B6B6A", margin: "0 0 12px", lineHeight: 1.7 }}>
          同意のない結果・スコアの詳細・面接指導の申出情報はここには表示されません。
        </p>
        {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 10 }}>{err}</div>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                {["実施日", "氏名", "社員番号", "部署", "判定"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "9px 10px" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <td style={{ padding: "9px 10px" }}>{new Date(r.taken_at).toLocaleDateString("ja-JP")}</td>
                  <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>{r.name}</td>
                  <td style={{ padding: "9px 10px" }}>{r.emp_id ?? ""}</td>
                  <td style={{ padding: "9px 10px" }}>{r.dept}</td>
                  <td style={{ padding: "9px 10px" }}>
                    {r.high_stress ? <Badge tone="red">高ストレス</Badge> : <Badge tone="gray">高ストレスに該当せず</Badge>}
                  </td>
                </tr>
              ))}
              {rows !== null && rows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#8A9694" }}>
                    同意のある結果はまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
