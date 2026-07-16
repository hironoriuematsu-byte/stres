"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { GroupAnalysisRow } from "@/lib/types";

export function GroupAnalysis({
  companyId,
  fiscalYear,
  reportHref,
}: {
  companyId: string;
  fiscalYear: number;
  reportHref?: string;
}) {
  const [rows, setRows] = useState<GroupAnalysisRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    setRows(null);
    setErr(null);
    supabase
      .rpc("group_analysis", { target_company: companyId, target_year: fiscalYear })
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        setRows((data as GroupAnalysisRow[]) ?? []);
      });
  }, [companyId, fiscalYear]);

  if (err) {
    return (
      <Card>
        <p style={{ fontSize: 13, color: "#B02A2A", margin: 0 }}>集団分析の取得に失敗しました: {err}</p>
      </Card>
    );
  }
  if (rows === null) return <Card>読み込み中…</Card>;

  const chartData = rows.map((r) => ({ dept: r.dept, 高ストレス率: Number(r.high_rate) }));

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>集団分析(部署別・{fiscalYear}年度)</h3>
        {reportHref && (
          <a
            href={reportHref}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: brand.tealDark,
              border: `1px solid ${brand.teal}`,
              borderRadius: 10,
              padding: "8px 14px",
              textDecoration: "none",
            }}
          >
            📄 集団分析報告書(印刷・PDF)
          </a>
        )}
      </div>
      <p style={{ fontSize: 12, color: brand.orange, fontWeight: 700, margin: "0 0 12px" }}>
        ※ 10名未満の部署は個人特定防止のため表示されません(全体は受検者の合計が10名以上であれば表示されます)
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "#8A9694" }}>
          まだ表示できる集計がありません(受検者の合計が10名以上になると「全体」の集計が表示されます)。
        </p>
      ) : (
        <>
          <div style={{ width: "100%", height: Math.max(120, rows.length * 48) }}>
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 16, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={brand.line} />
                <XAxis type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="dept" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="高ストレス率" fill={brand.teal} radius={[0, 6, 6, 0]} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                  {["部署", "受検者数", "高ストレス者数", "高ストレス率", "A平均", "B平均", "C平均"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "9px 10px", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.dept}
                    style={{ borderBottom: `1px solid ${brand.line}`, background: r.dept === "全体" ? "#F4FAF9" : "#fff" }}
                  >
                    <td style={{ padding: "9px 10px", fontWeight: 700, color: brand.ink }}>{r.dept}</td>
                    <td style={{ padding: "9px 10px" }}>{r.n}</td>
                    <td style={{ padding: "9px 10px" }}>{r.high_n}</td>
                    <td style={{ padding: "9px 10px" }}>{r.high_rate}%</td>
                    <td style={{ padding: "9px 10px" }}>{r.avg_a}</td>
                    <td style={{ padding: "9px 10px" }}>{r.avg_b}</td>
                    <td style={{ padding: "9px 10px" }}>{r.avg_c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
