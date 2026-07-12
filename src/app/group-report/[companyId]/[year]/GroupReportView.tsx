"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SCALES } from "@/lib/profile-report";
import { aggregateByDept, DeptAggregate, GroupResultInput, MIN_GROUP } from "@/lib/group-report";
import { logAccess } from "@/lib/log";

const CATEGORY_LABEL = {
  stressor: "A. ストレスの原因と考えられる因子",
  reaction: "B. ストレスによっておこる心身の反応",
  support: "C. サポート・満足度",
} as const;

// 平均評価点のセル色(悪い方向を赤系で強調)
function gradeCellColor(key: string, v: number | null): string {
  if (v == null) return "#fff";
  const def = SCALES.find((s) => s.key === key)!;
  const bad = def.direction === "negative" ? v : (def.male.length + 1) - v;
  if (bad >= 4) return "#FDE3E3";
  if (bad >= 3.4) return "#FCEADC";
  return "#fff";
}

function JudgeScatter({
  title,
  xLabel,
  yLabel,
  data,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  data: { dept: string; x: number; y: number }[];
}) {
  return (
    <div>
      <h3 style={{ fontSize: 12.5, color: brand.ink, textAlign: "center", margin: "8px 0 0" }}>{title}</h3>
      <div style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 16, right: 24, bottom: 14, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={brand.line} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[3, 12]}
              tickCount={10}
              tick={{ fontSize: 10 }}
              label={{ value: xLabel, position: "insideBottom", offset: -8, fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[3, 12]}
              tickCount={10}
              tick={{ fontSize: 10 }}
              label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11 }}
            />
            <Tooltip
              formatter={(v: number) => v}
              labelFormatter={() => ""}
              content={({ payload }) =>
                payload && payload.length > 0 ? (
                  <div style={{ background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
                    <strong>{(payload[0].payload as { dept: string }).dept}</strong>
                    <div>
                      {xLabel}: {(payload[0].payload as { x: number }).x} / {yLabel}: {(payload[0].payload as { y: number }).y}
                    </div>
                  </div>
                ) : null
              }
            />
            <Scatter data={data} fill={brand.teal} isAnimationActive={false}>
              <LabelList dataKey="dept" position="top" style={{ fontSize: 10, fill: "#44534F" }} />
              {data.map((d, i) => (
                <Cell key={i} fill={d.dept === "全体" ? brand.orange : brand.teal} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function GroupReportView({
  companyId,
  companyName,
  fiscalYear,
}: {
  companyId: string;
  companyName: string;
  fiscalYear: number;
}) {
  const [rows, setRows] = useState<GroupResultInput[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("results")
      .select("dept, answers, gender, high_stress, score_a, score_b, score_c")
      .eq("company_id", companyId)
      .eq("fiscal_year", fiscalYear)
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        setRows((data as GroupResultInput[]) ?? []);
        logAccess(supabase, "view_group_report", `${companyName}/${fiscalYear}`, companyId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fiscalYear]);

  if (err) {
    return <div style={{ maxWidth: 860, margin: "0 auto", color: "#B02A2A", fontSize: 14 }}>取得エラー: {err}</div>;
  }
  if (rows === null) return <div style={{ maxWidth: 860, margin: "0 auto" }}>読み込み中…</div>;

  const { total, depts, excludedDepts } = aggregateByDept(rows);
  const groups: DeptAggregate[] = [...depts, ...(total ? [total] : [])];

  const scatter1 = groups
    .filter((g) => g.quant != null && g.control != null)
    .map((g) => ({ dept: g.dept, x: g.control!, y: g.quant! }));
  const scatter2 = groups
    .filter((g) => g.boss != null && g.coworker != null)
    .map((g) => ({ dept: g.dept, x: g.boss!, y: g.coworker! }));

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <style>{`
        @media print {
          header, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .report-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
        }
        @page { size: A4; margin: 12mm; }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <Btn tone="ghost" onClick={() => history.back()} style={{ padding: "8px 14px", fontSize: 13 }}>
          戻る
        </Btn>
        <Btn onClick={() => window.print()} style={{ padding: "8px 16px", fontSize: 13 }}>
          印刷 / PDFとして保存
        </Btn>
      </div>

      <div className="report-sheet" style={{ background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 12, padding: 28 }}>
        <div style={{ borderBottom: `3px solid ${brand.teal}`, paddingBottom: 10, marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, color: brand.ink, margin: "0 0 4px" }}>ストレスチェック集団分析報告書</h1>
          <p style={{ fontSize: 11, color: "#7A8886", margin: 0 }}>
            {companyName} / {fiscalYear}年度 / 職業性ストレス簡易調査票(57項目)/ 実施者: うえまつ産業医事務所 /
            作成日: {new Date().toLocaleDateString("ja-JP")}
          </p>
        </div>

        {/* サマリー */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            ["受検者数", `${rows.length} 名`],
            ["高ストレス者数", `${rows.filter((r) => r.high_stress).length} 名`],
            ["高ストレス率", rows.length ? `${Math.round((rows.filter((r) => r.high_stress).length / rows.length) * 1000) / 10}%` : "—"],
            ["集計対象部署", `${depts.length} 部署`],
          ].map(([k, v]) => (
            <div key={k} style={{ border: `1px solid ${brand.line}`, borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#5B6B6A" }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: brand.tealDark }}>{v}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: brand.orange, fontWeight: 700, margin: "0 0 14px" }}>
          ※ 受検者{MIN_GROUP}名未満の部署({excludedDepts}部署)は個人特定防止のため集計から除外しています。
        </p>

        {groups.length === 0 ? (
          <p style={{ fontSize: 13, color: "#8A9694" }}>
            集計可能な集団({MIN_GROUP}名以上)がまだありません。
          </p>
        ) : (
          <>
            {/* 高ストレス率 */}
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "0 0 4px" }}>部署別 高ストレス者率</h2>
            <div style={{ width: "100%", height: Math.max(120, groups.length * 44) }}>
              <ResponsiveContainer>
                <BarChart data={groups.map((g) => ({ dept: g.dept, 高ストレス率: g.highRate }))} layout="vertical" margin={{ left: 16, right: 32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={brand.line} />
                  <XAxis type="number" unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="dept" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="高ストレス率" fill={brand.teal} radius={[0, 6, 6, 0]} barSize={20} isAnimationActive={false}>
                    <LabelList dataKey="高ストレス率" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 部署別基本表 */}
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "14px 0 6px" }}>部署別集計</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                    {["部署", "受検者数", "高ストレス者数", "高ストレス率", "A平均", "B平均", "C平均", "量的負担", "コントロール", "上司支援", "同僚支援"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.dept} style={{ borderBottom: `1px solid ${brand.line}`, background: g.dept === "全体" ? "#F4FAF9" : "#fff" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: brand.ink }}>{g.dept}</td>
                      <td style={{ padding: "6px 8px" }}>{g.n}</td>
                      <td style={{ padding: "6px 8px" }}>{g.highN}</td>
                      <td style={{ padding: "6px 8px" }}>{g.highRate}%</td>
                      <td style={{ padding: "6px 8px" }}>{g.avgA}</td>
                      <td style={{ padding: "6px 8px" }}>{g.avgB}</td>
                      <td style={{ padding: "6px 8px" }}>{g.avgC}</td>
                      <td style={{ padding: "6px 8px" }}>{g.quant ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{g.control ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{g.boss ?? "—"}</td>
                      <td style={{ padding: "6px 8px" }}>{g.coworker ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 判定図プロット */}
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "16px 0 0" }}>仕事のストレス判定図(部署プロット)</h2>
            <p style={{ fontSize: 11, color: "#8A9694", margin: "2px 0 0" }}>
              左図は左上(負担が多くコントロールが低い)ほど、右図は左下(上司・同僚の支援がともに少ない)ほど健康リスクが高い領域です。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 8 }}>
              <JudgeScatter title="量的負担 × コントロール判定図" xLabel="仕事のコントロール" yLabel="量的負担" data={scatter1} />
              <JudgeScatter title="職場の支援判定図" xLabel="上司の支援" yLabel="同僚の支援" data={scatter2} />
            </div>

            {/* 尺度別平均評価点 */}
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "16px 0 6px" }}>尺度別 平均評価点(素点換算・5段階)</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <thead>
                  <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                    <th style={{ textAlign: "left", padding: "5px 8px" }}>尺度</th>
                    {groups.map((g) => (
                      <th key={g.dept} style={{ textAlign: "left", padding: "5px 8px", whiteSpace: "nowrap" }}>
                        {g.dept}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(["stressor", "reaction", "support"] as const).map((cat) => (
                    <>
                      <tr key={cat}>
                        <td colSpan={groups.length + 1} style={{ padding: "5px 8px", background: "#F4FAF9", fontWeight: 700, color: brand.tealDark }}>
                          {CATEGORY_LABEL[cat]}
                        </td>
                      </tr>
                      {SCALES.filter((s) => s.category === cat).map((s) => (
                        <tr key={s.key} style={{ borderBottom: `1px solid ${brand.line}` }}>
                          <td style={{ padding: "5px 8px", color: brand.ink }}>{s.label}</td>
                          {groups.map((g) => (
                            <td key={g.dept} style={{ padding: "5px 8px", background: gradeCellColor(s.key, g.meanGrades[s.key]) }}>
                              {g.meanGrades[s.key] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 10.5, color: "#8A9694", margin: "6px 0 0", lineHeight: 1.7 }}>
              ※ 平均評価点は素点換算表(男女別)による各人の評価点(1〜5、単一項目尺度は1〜4)の部署平均です。
              負担・反応系の尺度は高いほど注意が必要(赤系の網掛け)、コントロール・サポート系は高いほど良好です。
              回答詳細のない旧データは尺度別集計から除外されています。
            </p>
          </>
        )}

        <p style={{ fontSize: 10.5, color: "#8A9694", marginTop: 18, lineHeight: 1.7 }}>
          本報告書は職場環境改善の検討資料であり、個人を特定できる情報は含まれていません。
          衛生委員会等での審議にご活用ください。発行: うえまつ産業医事務所 / ストレスチェックWeb
        </p>
      </div>
    </div>
  );
}
