"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { ResultRow } from "@/lib/types";
import { buildAdvice, computeProfile, hasCompleteAnswers, Gender, ScaleResult } from "@/lib/profile-report";
import { logAccess } from "@/lib/log";

const CATEGORY_LABEL = {
  stressor: "A. ストレスの原因と考えられる因子",
  reaction: "B. ストレスによっておこる心身の反応",
  support: "C. ストレス反応に影響を与える他の因子(サポート・満足度)",
} as const;

function Dots({ s }: { s: ScaleResult }) {
  // 5(4)段階の位置表示。悪い評価は赤系で強調
  const isBad = s.direction === "negative" ? s.grade >= s.gradeMax - 1 : s.grade <= 2;
  return (
    <span style={{ letterSpacing: 3, whiteSpace: "nowrap" }}>
      {Array.from({ length: s.gradeMax }, (_, i) => (
        <span key={i} style={{ color: i + 1 === s.grade ? (isBad ? "#D64545" : brand.teal) : "#C9D6D4" }}>
          {i + 1 === s.grade ? "●" : "○"}
        </span>
      ))}
    </span>
  );
}

function ScaleTable({ rows }: { rows: ScaleResult[] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead>
        <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
          <th style={{ textAlign: "left", padding: "6px 8px" }}>尺度</th>
          <th style={{ textAlign: "left", padding: "6px 8px" }}>素点(換算後)</th>
          <th style={{ textAlign: "left", padding: "6px 8px" }}>評価</th>
          <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>低い ← → 高い</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.key} style={{ borderBottom: `1px solid ${brand.line}` }}>
            <td style={{ padding: "6px 8px", fontWeight: 700, color: brand.ink }}>{s.label}</td>
            <td style={{ padding: "6px 8px" }}>{s.raw}点</td>
            <td style={{ padding: "6px 8px" }}>{s.gradeLabel}</td>
            <td style={{ padding: "6px 8px" }}>
              <Dots s={s} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportView({
  result,
  subjectName,
  subjectEmpId,
  companyName,
  backHref,
  backLabel,
}: {
  result: ResultRow & { answers: unknown; gender: Gender | null };
  subjectName: string;
  subjectEmpId: string;
  companyName: string;
  backHref: string;
  backLabel: string;
}) {
  useEffect(() => {
    const supabase = createClient();
    logAccess(supabase, "view_result_detail", `report:${result.id}`, result.company_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detailed = hasCompleteAnswers(result.answers) && (result.gender === "male" || result.gender === "female");
  const profile = detailed ? computeProfile(result.answers as never, result.gender as Gender) : null;
  const advice = profile ? buildAdvice(profile, result.high_stress) : null;

  const radarFor = (cat: "stressor" | "reaction" | "support") =>
    (profile ?? [])
      .filter((s) => s.category === cat)
      .map((s) => ({
        scale: s.short,
        評価: s.radar,
      }));

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .report-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
        }
        @page { size: A4; margin: 14mm; }
      `}</style>

      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 12 }}>
        <Link href={backHref}>
          <Btn tone="ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
            {backLabel}
          </Btn>
        </Link>
        <Btn onClick={() => window.print()} style={{ padding: "8px 16px", fontSize: 13 }}>
          印刷 / PDFとして保存
        </Btn>
      </div>

      <div
        className="report-sheet"
        style={{
          background: "#fff",
          border: `1px solid ${brand.line}`,
          borderRadius: 12,
          padding: 28,
        }}
      >
        {/* ヘッダ */}
        <div style={{ borderBottom: `3px solid ${brand.teal}`, paddingBottom: 10, marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, color: brand.ink, margin: "0 0 4px" }}>ストレスチェック個人結果票</h1>
          <p style={{ fontSize: 11, color: "#7A8886", margin: 0 }}>
            職業性ストレス簡易調査票(57項目)/ 実施者: うえまつ産業医事務所
          </p>
        </div>

        <table style={{ width: "100%", fontSize: 13, marginBottom: 16, borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ padding: "4px 8px", color: "#5B6B6A", width: 90 }}>会社名</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: brand.ink }}>{companyName}</td>
              <td style={{ padding: "4px 8px", color: "#5B6B6A", width: 90 }}>実施年度</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: brand.ink }}>{result.fiscal_year}年度</td>
            </tr>
            <tr>
              <td style={{ padding: "4px 8px", color: "#5B6B6A" }}>氏名</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: brand.ink }}>{subjectName}</td>
              <td style={{ padding: "4px 8px", color: "#5B6B6A" }}>実施日</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: brand.ink }}>
                {new Date(result.created_at).toLocaleDateString("ja-JP")}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "4px 8px", color: "#5B6B6A" }}>社員番号</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: brand.ink }}>{subjectEmpId}</td>
              <td style={{ padding: "4px 8px", color: "#5B6B6A" }}>部署</td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: brand.ink }}>{result.dept}</td>
            </tr>
          </tbody>
        </table>

        {/* 総合判定 */}
        <div
          style={{
            border: `2px solid ${result.high_stress ? "#D64545" : brand.teal}`,
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: brand.ink }}>総合判定:</span>
            {result.high_stress ? <Badge tone="red">高ストレス(面接指導の対象)</Badge> : <Badge>高ストレスに該当せず</Badge>}
          </div>
          <p style={{ fontSize: 12, color: "#5B6B6A", margin: "8px 0 0", lineHeight: 1.7 }}>
            判定基準(合計点数法): ①心身のストレス反応(B領域)の合計が77点以上、または
            ②B領域63点以上かつストレス要因(A領域)+サポート(C領域)の合計が76点以上。
            あなたの得点 — A: {result.score_a}/68点、B: {result.score_b}/116点、C: {result.score_c}/36点、A+C:{" "}
            {result.score_a + result.score_c}点。
          </p>
        </div>

        {detailed && profile && advice ? (
          <>
            {/* レーダーチャート(3分割) */}
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "0 0 4px" }}>ストレスプロフィール(レーダーチャート)</h2>
            <p style={{ fontSize: 11.5, color: "#8A9694", margin: "0 0 4px" }}>
              素点換算表({result.gender === "male" ? "男性" : "女性"})による評価。チャートが外側に広いほど良好な状態、
              中心に向かって小さいほどストレス状況に注意が必要です。
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 4 }}>
              {(["stressor", "reaction", "support"] as const).map((cat) => (
                <div key={cat}>
                  <h3 style={{ fontSize: 12, color: brand.ink, textAlign: "center", margin: "8px 0 0" }}>
                    {CATEGORY_LABEL[cat]}
                  </h3>
                  <div style={{ width: "100%", height: 250 }}>
                    <ResponsiveContainer>
                      <RadarChart data={radarFor(cat)} outerRadius="68%">
                        <PolarGrid stroke={brand.line} />
                        <PolarAngleAxis dataKey="scale" tick={{ fontSize: 9.5, fill: "#44534F" }} />
                        <PolarRadiusAxis domain={[0, 5]} tickCount={6} tick={{ fontSize: 8 }} />
                        <Radar
                          dataKey="評価"
                          stroke={brand.teal}
                          strokeWidth={2}
                          fill={brand.teal}
                          fillOpacity={0.3}
                          dot={{ r: 3, fill: brand.tealDark, strokeWidth: 0 }}
                          isAnimationActive={false}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ))}
            </div>

            {/* 尺度別評価表 */}
            {(["stressor", "reaction", "support"] as const).map((cat) => (
              <div key={cat} style={{ marginTop: 14 }}>
                <h2 style={{ fontSize: 14, color: brand.tealDark, margin: "0 0 6px" }}>{CATEGORY_LABEL[cat]}</h2>
                <ScaleTable rows={profile.filter((s) => s.category === cat)} />
              </div>
            ))}
            <p style={{ fontSize: 11, color: "#8A9694", margin: "8px 0 0", lineHeight: 1.6 }}>
              ※ 評価は全国の労働者データに基づく素点換算表(男女別)による5段階(単一質問の尺度は4段階)です。
              「心理的な仕事の負担」等の負担・反応系の尺度は評価が高いほど注意が必要、
              「コントロール度」「サポート」等の資源系の尺度は評価が高いほど良好であることを示します。
            </p>

            {/* コメント */}
            <div
              style={{
                marginTop: 16,
                background: "#F4FAF9",
                border: `1px solid ${brand.line}`,
                borderRadius: 10,
                padding: "12px 16px",
              }}
            >
              <h2 style={{ fontSize: 14, color: brand.tealDark, margin: "0 0 8px" }}>結果の見方とアドバイス</h2>
              {advice.map((t, i) => (
                <p key={i} style={{ fontSize: 12.5, color: "#44534F", lineHeight: 1.8, margin: "0 0 6px" }}>
                  ・{t}
                </p>
              ))}
            </div>
          </>
        ) : (
          <div
            style={{
              background: "#FBF3E3",
              border: "1px solid #EFD9A8",
              borderRadius: 10,
              padding: "12px 16px",
              fontSize: 13,
              color: "#8A6B2E",
              lineHeight: 1.8,
            }}
          >
            この受検データには回答の詳細(または性別の情報)が記録されていないため、尺度別のストレスプロフィールは表示できません(上記の領域別得点と総合判定のみ有効です)。
          </div>
        )}

        <p style={{ fontSize: 10.5, color: "#8A9694", marginTop: 18, lineHeight: 1.7 }}>
          本結果票は労働安全衛生法第66条の10に基づくストレスチェックの個人結果であり、医療上の診断ではありません。
          本人の同意なく事業者へ提供されることはありません。結果は5年間保存されます。
          発行: うえまつ産業医事務所 / ストレスチェックWeb
        </p>
      </div>
    </div>
  );
}
