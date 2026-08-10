"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
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
import { riskTone } from "@/lib/health-risk";
import { logAccess } from "@/lib/log";

// 健康リスク値の表示色(全国平均=100 / 120以上要注意 / 150以上要対応)
const RISK_COLOR = {
  teal: "#0F9B8E",
  yellow: "#C9A227",
  orange: "#E8792B",
  red: "#D64545",
  gray: "#8A9694",
} as const;
const RISK_BG = { teal: "#fff", yellow: "#FBF7E8", orange: "#FCEADC", red: "#FDE3E3", gray: "#fff" } as const;

const rRisk = (v: number | null) => (v == null ? null : Math.round(v));

const CATEGORY_LABEL = {
  stressor: "A. ストレスの原因と考えられる因子",
  reaction: "B. ストレスによっておこる心身の反応",
  support: "C. サポート・満足度",
} as const;

// 職場のストレスプロフィール(レーダーチャート)。個人結果票と同じく
// 「外側ほど良好」に統一するため、悪い方向が高得点の尺度は反転して描画する。
//
// 基準線は全軸で3に統一する:
// - 5段階の多項目尺度: 素点換算表は全国分布で10%/23.3%/33.3%/23.3%/10%と
//   なるよう設計されており、評価点の期待値は3(=全国平均水準)
// - 単一項目の4段階尺度(身体的負担度・職場環境・技能の活用度・適性度・
//   働きがい): 全国分布に基づく基準化はされていないため、目盛り中央の
//   期待値2.5を「参考基準」とみなし、1〜5の目盛りへ線形換算して3に揃える
//   (2.5→3.0。全国調査に基づく平均値ではない点は画面の説明文に明記)
// 評価点は男女別換算表で個人ごとに算出後に平均するため、
// 集団平均は実際の男女構成で加重された値になる。
function radarDataFor(
  cat: "stressor" | "reaction" | "support",
  group: DeptAggregate,
  total: DeptAggregate | null
) {
  return SCALES.filter((s) => s.category === cat).map((s) => {
    const max = s.male.length;
    const disp = (v: number | null) => {
      if (v == null) return null;
      const outer = s.direction === "negative" ? max + 1 - v : v; // 外側ほど良好に反転
      // 4段階(1〜4)は1〜5に線形換算して基準点を3に統一(5段階はそのまま)
      const scaled = max === 4 ? 1 + ((outer - 1) * 4) / 3 : outer;
      return Math.round(scaled * 100) / 100;
    };
    const row: Record<string, string | number | null> = {
      scale: s.short,
      全国平均: 3,
      部署: group.detailCount > 0 ? disp(group.meanGrades[s.key]) : null,
    };
    if (total && total.dept !== group.dept && total.detailCount > 0) {
      row["全体"] = disp(total.meanGrades[s.key]);
    }
    return row;
  });
}

function GroupRadarBlock({ group, total }: { group: DeptAggregate; total: DeptAggregate | null }) {
  const showTotal = total && total.dept !== group.dept && total.detailCount > 0;
  return (
    <div style={{ pageBreakInside: "avoid", marginTop: 10 }}>
      <h3 style={{ fontSize: 13.5, color: brand.ink, margin: "0 0 2px" }}>
        {group.dept}
        <span style={{ fontSize: 11, color: "#8A9694", fontWeight: 400 }}>
          (集計対象 {group.detailCount} 名)
        </span>
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 4 }}>
        {(
          [
            ["stressor", CATEGORY_LABEL.stressor],
            ["reaction", CATEGORY_LABEL.reaction],
            ["support", CATEGORY_LABEL.support],
          ] as const
        ).map(([cat, label]) => (
          <div key={cat}>
            <p style={{ fontSize: 11, color: brand.tealDark, textAlign: "center", margin: "4px 0 0", fontWeight: 700 }}>
              {label}
            </p>
            <div style={{ width: "100%", height: 230 }}>
              <ResponsiveContainer>
                <RadarChart data={radarDataFor(cat, group, total)} outerRadius="68%">
                  <PolarGrid stroke={brand.line} />
                  <PolarAngleAxis dataKey="scale" tick={{ fontSize: 9.5 }} />
                  <PolarRadiusAxis domain={[1, 5]} tickCount={5} tick={{ fontSize: 8.5 }} angle={90} />
                  <Radar
                    name="基準線(3)"
                    dataKey="全国平均"
                    stroke="#8A9694"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    fill="#8A9694"
                    fillOpacity={0}
                    isAnimationActive={false}
                  />
                  {showTotal && (
                    <Radar
                      name="全体平均"
                      dataKey="全体"
                      stroke={brand.orange}
                      strokeWidth={2}
                      fill={brand.orange}
                      fillOpacity={0.06}
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                    />
                  )}
                  <Radar
                    name={group.dept === "全体" ? "全体平均" : `${group.dept}平均`}
                    dataKey="部署"
                    stroke={brand.teal}
                    strokeWidth={2}
                    fill={brand.teal}
                    fillOpacity={0.12}
                    dot={{ r: 2.5 }}
                    isAnimationActive={false}
                  />
                  <Legend wrapperStyle={{ fontSize: 10.5 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  riskLabel,
  data,
}: {
  title: string;
  xLabel: string;
  yLabel: string;
  riskLabel: string;
  data: { dept: string; x: number; y: number; risk: number | null }[];
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
                    <div>
                      {riskLabel}: {(payload[0].payload as { risk: number | null }).risk ?? "—"}
                    </div>
                  </div>
                ) : null
              }
            />
            <Scatter data={data} fill={brand.teal} isAnimationActive={false}>
              <LabelList dataKey="dept" position="top" style={{ fontSize: 10, fill: "#44534F" }} />
              <LabelList
                dataKey="risk"
                position="bottom"
                formatter={(v: number | null) => (v == null ? "" : `リスク ${v}`)}
                style={{ fontSize: 10, fontWeight: 700 }}
              />
              {data.map((d, i) => (
                <Cell key={i} fill={RISK_COLOR[riskTone(d.risk)]} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: 10, color: "#8A9694", textAlign: "center", margin: "0 0 4px" }}>
        点の色と数値は{riskLabel}(全国平均=100):
        <span style={{ color: RISK_COLOR.teal, fontWeight: 700 }}> ●100未満 </span>/
        <span style={{ color: RISK_COLOR.yellow, fontWeight: 700 }}> ●100以上 </span>/
        <span style={{ color: RISK_COLOR.orange, fontWeight: 700 }}> ●120以上 </span>/
        <span style={{ color: RISK_COLOR.red, fontWeight: 700 }}> ●150以上 </span>
      </p>
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
    .map((g) => ({ dept: g.dept, x: g.control!, y: g.quant!, risk: rRisk(g.healthRisk.a) }));
  const scatter2 = groups
    .filter((g) => g.boss != null && g.coworker != null)
    .map((g) => ({ dept: g.dept, x: g.boss!, y: g.coworker!, risk: rRisk(g.healthRisk.b) }));

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
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
          {total && total.healthRisk.total != null && (
            <div
              style={{
                border: `2px solid ${RISK_COLOR[riskTone(total.healthRisk.total)]}`,
                background: RISK_BG[riskTone(total.healthRisk.total)],
                borderRadius: 10,
                padding: "10px 18px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11, color: "#5B6B6A" }}>総合健康リスク(全体・全国平均=100)</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: RISK_COLOR[riskTone(total.healthRisk.total)] }}>
                {rRisk(total.healthRisk.total)}
              </div>
            </div>
          )}
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
                    {["部署", "受検者数", "高ストレス者数", "高ストレス率", "A平均", "B平均", "C平均", "量的負担", "コントロール", "上司支援", "同僚支援", "リスクA", "リスクB", "総合健康リスク"].map((h) => (
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
                      <td style={{ padding: "6px 8px", background: RISK_BG[riskTone(g.healthRisk.a)] }}>
                        {rRisk(g.healthRisk.a) ?? "—"}
                      </td>
                      <td style={{ padding: "6px 8px", background: RISK_BG[riskTone(g.healthRisk.b)] }}>
                        {rRisk(g.healthRisk.b) ?? "—"}
                      </td>
                      <td
                        style={{
                          padding: "6px 8px",
                          fontWeight: 800,
                          color: RISK_COLOR[riskTone(g.healthRisk.total)],
                          background: RISK_BG[riskTone(g.healthRisk.total)],
                        }}
                      >
                        {rRisk(g.healthRisk.total) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 判定図プロット */}
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "16px 0 0" }}>仕事のストレス判定図(部署プロット・健康リスク)</h2>
            <p style={{ fontSize: 11, color: "#8A9694", margin: "2px 0 0" }}>
              左図は左上(負担が多くコントロールが低い)ほど、右図は左下(上司・同僚の支援がともに少ない)ほど健康リスクが高い領域です。
              各点の下の数値がその集団の健康リスク(全国平均=100)で、健康問題の起きやすさが全国平均の何倍かを表します(例: 120なら1.2倍)。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 8 }}>
              <JudgeScatter
                title="量的負担 × コントロール判定図"
                xLabel="仕事のコントロール"
                yLabel="量的負担"
                riskLabel="健康リスクA"
                data={scatter1}
              />
              <JudgeScatter
                title="職場の支援判定図"
                xLabel="上司の支援"
                yLabel="同僚の支援"
                riskLabel="健康リスクB"
                data={scatter2}
              />
            </div>
            <p style={{ fontSize: 10.5, color: "#8A9694", margin: "4px 0 0", lineHeight: 1.7 }}>
              ※ 健康リスクは「仕事のストレス判定図」(東京大学・職業性ストレス簡易調査票用係数、全国平均値は東京医科大学プログラムの訂正値)に基づき、
              リスクA = 100×exp{"{"}(量的負担−全国平均)×α+(コントロール−全国平均)×β{"}"}、リスクB = 100×exp{"{"}(上司支援−全国平均)×γ+(同僚支援−全国平均)×δ{"}"}、
              総合健康リスク = A×B÷100 で算出しています。判定図は男女別のため、男女それぞれの平均点で算出し受検者数で加重平均した値(男女計)を表示しています。
              総合健康リスクが120以上の集団は仕事のストレスに関する問題がある可能性があり、職場環境改善の優先的な検討をおすすめします。
            </p>

            {/* 職場のストレスプロフィール(レーダーチャート) */}
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "16px 0 0" }}>
              職場のストレスプロフィール(部署別レーダーチャート)
            </h2>
            <p style={{ fontSize: 11, color: "#8A9694", margin: "2px 0 0", lineHeight: 1.7 }}>
              各部署の平均評価点を、全体平均(オレンジ)・基準線(灰色の点線)と重ねて表示します。
              個人結果票と同じく<strong>外側ほど良好</strong>になるよう統一しています(負担・反応系の尺度は反転して描画)。
              基準線は<strong>全尺度で「3」に統一</strong>しています。5段階の多項目尺度では、素点換算表が全国分布を
              10%/23.3%/33.3%/23.3%/10%に区分する設計のため評価点の期待値が3となり、基準線3 = <strong>全国平均水準</strong>です。
              単一項目の4段階尺度(自覚的な身体的負担度・職場環境・技能の活用度・仕事の適性度・働きがい)は全国分布に基づく基準化が
              されていないため、目盛り中央の期待値2.5を<strong>参考基準</strong>とみなして1〜5の目盛りに換算し、基準線3に揃えています
              (これらの尺度の基準線は全国調査に基づく平均値ではない点にご留意ください。正確な水準は下の平均評価点の表をご参照ください)。
              評価点は男女別の換算表で個人ごとに算出してから平均するため、集団の値は実際の男女構成で加重されています。
              灰色の点線(3)より内側にへこんでいる項目が、基準より悪い方向の項目です。
            </p>
            {groups
              .filter((g) => g.detailCount > 0)
              .map((g) => (
                <GroupRadarBlock key={g.dept} group={g} total={total} />
              ))}
            {groups.every((g) => g.detailCount === 0) && (
              <p style={{ fontSize: 12, color: "#8A9694", margin: "8px 0 0" }}>
                回答詳細と性別が記録されたデータがないため、レーダーチャートは表示できません。
              </p>
            )}

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
            <div style={{ fontSize: 10.5, color: "#8A9694", margin: "6px 0 0", lineHeight: 1.8 }}>
              <p style={{ margin: 0 }}>
                ※ 平均評価点は、厚生労働省の素点換算表(男女別)による各人の評価点(1〜5の5段階、単一項目尺度は1〜4)の集団平均です。
                評価点は全国データに基づいて区分されており、<strong>3が全国平均的な水準</strong>です(3より悪い方向に離れるほど注意が必要)。
                負担・反応系の尺度は点が高いほど悪い方向、コントロール・サポート系の尺度は点が低いほど悪い方向を意味します。
              </p>
              <p style={{ margin: "4px 0 0" }}>
                ※ 網掛けの基準(悪い方向に換算した平均評価点):{" "}
                <span style={{ background: "#FCEADC", padding: "1px 8px", borderRadius: 4 }}>3.4以上 = 注意</span>{" "}
                <span style={{ background: "#FDE3E3", padding: "1px 8px", borderRadius: 4 }}>4.0以上 = 要注意</span>{" "}
                (全国平均3を基準に、それぞれ「やや悪い」「明らかに悪い」水準の目安)。網掛けのない欄は概ね全国平均並みか良好です。
              </p>
              <p style={{ margin: "4px 0 0" }}>
                ※ 回答詳細のない旧データは尺度別集計から除外されています。
              </p>
            </div>
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
