"use client";

import React, { useEffect } from "react";
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
import { questionnaireLabel } from "@/lib/questionnaire-label";
import { ageAt, formatBirthDate } from "@/lib/birth-date";
import { IMPLEMENTER } from "@/lib/org";
import { PrintHeader } from "@/components/PrintHeader";
import { RadarTick } from "@/components/RadarTick";
import {
  EXT80_GROUP_LABEL,
  Ext80ScaleResult,
  computeExt80,
  isExt80Complete,
} from "@/lib/questionnaire80";

const CATEGORY_LABEL = {
  stressor: "A. ストレスの原因と考えられる因子",
  reaction: "B. ストレスによっておこる心身の反応",
  support: "C. ストレス反応に影響を与える他の因子(サポート・満足度)",
} as const;

function Dots({ s }: { s: ScaleResult }) {
  // 素点換算表の5つの欄(低い〜高い)での位置表示。悪い評価は赤系で強調。
  // 4段階の尺度は換算表どおり該当しない欄を空けて表示する
  const isBad = s.direction === "negative" ? s.column >= 4 : s.column <= 2;
  return (
    <span style={{ display: "inline-flex", justifyContent: "center", width: "5em", whiteSpace: "nowrap" }}>
      {[1, 2, 3, 4, 5].map((c) => (
        <span
          key={c}
          style={{ width: "1em", textAlign: "center", color: c === s.column ? (isBad ? "#D64545" : brand.teal) : "#C9D6D4" }}
        >
          {!s.columns.includes(c) ? "" : c === s.column ? "●" : "○"}
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
          {/* 右3列は内容の幅に抑え、尺度名の列を広く取る(スマホで尺度名が細かく折り返されないように) */}
          <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: "1%" }}>
            素点
            <br />
            (換算後)
          </th>
          <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap", width: "1%" }}>評価</th>
          <th style={{ textAlign: "center", padding: "6px 8px", width: "1%" }}>
            <span style={{ whiteSpace: "nowrap" }}>少ない/低い ←</span> <span style={{ whiteSpace: "nowrap" }}>→ 多い/高い</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((s) => (
          <tr key={s.key} style={{ borderBottom: `1px solid ${brand.line}` }}>
            <td style={{ padding: "6px 8px", fontWeight: 700, color: brand.ink }}>{s.label}</td>
            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{s.raw}点</td>
            <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{s.gradeLabel}</td>
            <td style={{ padding: "6px 8px", textAlign: "center" }}>
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
  subjectBirthDate,
  companyName,
  backHref,
  backLabel,
  demo = false,
  embedded = false,
}: {
  result: ResultRow & { answers: unknown; gender: Gender | null; answers_ext?: unknown; questionnaire?: string };
  subjectName: string;
  subjectBirthDate: string | null; // YYYY-MM-DD。未登録なら null
  companyName: string;
  backHref: string;
  backLabel: string;
  demo?: boolean; // 紹介用デモ: アクセスログを記録しない
  embedded?: boolean; // 受検直後の結果画面の下に続けて表示する(戻るボタンの代わりに見出しを付ける)
}) {
  useEffect(() => {
    if (demo) return;
    const supabase = createClient();
    logAccess(supabase, "view_result_detail", `report:${result.id}`, result.company_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 80項目版の追加23項目(職場環境の資源など)。回答があるときだけ表示する
  const ext80: Ext80ScaleResult[] | null = isExt80Complete(result.answers_ext)
    ? computeExt80(result.answers_ext, result.gender === "male" || result.gender === "female" ? result.gender : null)
    : null;

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

  // 生年月日と実施日時点の年齢(同姓同名の方の区別のため。未登録なら「未登録」)
  const birthAge = subjectBirthDate ? ageAt(subjectBirthDate, new Date(result.created_at)) : null;
  const birthDateText = subjectBirthDate
    ? `${formatBirthDate(subjectBirthDate)}${birthAge != null ? ` (${birthAge}歳)` : ""}`
    : "未登録";

  return (
    <div style={{ maxWidth: 860, margin: embedded ? "24px auto 0" : "0 auto" }}>
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .report-sheet { border: none !important; box-shadow: none !important; padding: 14mm !important; }
        }
        /* ページ余白を0にしてブラウザのヘッダー/フッター(URL・日付・題名)を印字させず、余白は帳票側(.report-sheet)で取る */
        @page { size: A4; margin: 0; }
      `}</style>

      <div
        className="no-print"
        style={{ display: "flex", justifyContent: embedded ? "space-between" : "flex-end", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}
      >
        {embedded ? (
          <h2 style={{ fontSize: 18, color: brand.ink, margin: 0 }}>詳しい結果票</h2>
        ) : (
          <Link href={backHref}>
            <Btn tone="ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
              {backLabel}
            </Btn>
          </Link>
        )}
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
        {/* ヘッダ: 受検した企業名を大きく表示し、ロゴと「ストレスチェックWeb」を右に置く */}
        <PrintHeader
          title={`${result.fiscal_year}年度ストレスチェック個人結果票`}
          companyName={companyName}
          note={[
            // スマホ幅でも折り返さないよう、調査票・実施者・実施事務局をそれぞれ1行にする
            questionnaireLabel(!!ext80),
            `実施者: ${IMPLEMENTER.full}`,
            `実施事務局: ${IMPLEMENTER.officeName}`,
          ].join("\n")}
          questionnaire={ext80 ? "80" : "57"}
        />

        {/* 受検者情報: PC・印刷では2組×3行、スマホ幅では1組ずつ縦に並べる(globals.css の .report-info) */}
        <dl className="report-info" style={{ fontSize: 13, margin: "0 0 16px" }}>
          {(
            [
              ["会社名", companyName],
              ["実施年度", `${result.fiscal_year}年度`],
              ["氏名", subjectName],
              ["実施日", new Date(result.created_at).toLocaleDateString("ja-JP")],
              ["生年月日", birthDateText],
              ["部署", result.dept],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="report-info-item">
              <dt style={{ color: "#5B6B6A", margin: 0 }}>{k}</dt>
              <dd style={{ fontWeight: 700, color: brand.ink, margin: 0 }}>{v}</dd>
            </div>
          ))}
        </dl>

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
          {/* 本人の得点を「満点中◯点」で領域名と一緒に示し、続けて判定基準を同じ記号(A〜C)で書く */}
          <p style={{ fontSize: 13, color: brand.ink, margin: "8px 0 2px", fontWeight: 700 }}>あなたの得点</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto auto auto auto",
              justifyContent: "start",
              columnGap: 8,
              rowGap: 2,
              fontSize: 13,
              color: brand.ink,
              lineHeight: 1.6,
            }}
          >
            {(
              [
                ["A", "ストレスの原因", 68, result.score_a],
                ["B", "心身のストレス反応", 116, result.score_b],
                ["C", "周囲のサポート", 36, result.score_c],
                ["A+C", "AとCの合計", 104, result.score_a + result.score_c],
              ] as [string, string, number, number][]
            ).map(([key, label, max, score]) => (
              <React.Fragment key={key}>
                <span style={{ marginRight: 6 }}>
                  <strong>{key}</strong> {label}
                </span>
                {/* 得点・満点とも右寄せにして「点」「点中」の位置を縦にそろえる */}
                <strong style={{ whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {score}点
                </strong>
                <span style={{ color: "#5B6B6A" }}>/</span>
                {/* 満点も右寄せにして「点中」の位置をそろえる */}
                <span style={{ whiteSpace: "nowrap", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#5B6B6A" }}>
                  {max}点中
                </span>
              </React.Fragment>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#5B6B6A", margin: "6px 0 0", lineHeight: 1.7 }}>
            いずれも点数が高いほどストレスが高い状態です。判定基準(合計点数法): Bが77点以上、またはBが63点以上かつA+Cが76点以上の場合に「高ストレス」と判定します。
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
                    {/* C は長いので「(サポート・満足度)」を2行目に中央揃えで出す */}
                    {cat === "support" ? (
                      <>
                        C. ストレス反応に影響を与える他の因子
                        <br />
                        (サポート・満足度)
                      </>
                    ) : (
                      CATEGORY_LABEL[cat]
                    )}
                  </h3>
                  {/* 2行になった軸ラベル(家族・友人 など)が下端で切れないよう高さに余裕を持たせる */}
                  <div style={{ width: "100%", height: 270 }}>
                    <ResponsiveContainer>
                      {/* 長い軸ラベルは2行にし、半径を少し小さくして端で文字が切れないようにする */}
                      <RadarChart data={radarFor(cat)} outerRadius="62%" margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <PolarGrid stroke={brand.line} />
                        <PolarAngleAxis dataKey="scale" tick={<RadarTick fontSize={9.5} fill="#44534F" />} />
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

            {/* 尺度別評価表。レーダーチャートと同じ形の見出しを付け、●の色の見方を示す */}
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "18px 0 4px" }}>尺度別の評価</h2>
            <p style={{ fontSize: 11.5, color: "#8A9694", margin: "0 0 4px", lineHeight: 1.7 }}>
              各尺度の素点を素点換算表({result.gender === "male" ? "男性" : "女性"})で5段階に評価したものです(単一質問の尺度は4段階で、換算表に欄がない段階は空白にしています)。
              <span style={{ color: brand.teal }}>●</span>緑は良好〜普通、<span style={{ color: "#D64545" }}>●</span>赤は注意が必要な状態です。「負担」「イライラ感」などは多い・高いほど、「コントロール度」「サポート」などは低い・少ないほど注意が必要です。
            </p>
            {(["stressor", "reaction", "support"] as const).map((cat) => (
              <div key={cat} style={{ marginTop: 14 }}>
                <h2 style={{ fontSize: 14, color: brand.tealDark, margin: "0 0 6px" }}>
                  {/* C は長いので、レーダーチャートの見出しと同じく「(サポート・満足度)」を2行目に出し、
                      1行目の真ん中にそろえる(見出し全体は左寄せのまま) */}
                  {cat === "support" ? (
                    <span style={{ display: "inline-block", textAlign: "center" }}>
                      C. ストレス反応に影響を与える他の因子
                      <br />
                      (サポート・満足度)
                    </span>
                  ) : (
                    CATEGORY_LABEL[cat]
                  )}
                </h2>
                <ScaleTable rows={profile.filter((s) => s.category === cat)} />
              </div>
            ))}
            <p style={{ fontSize: 11, color: "#8A9694", margin: "8px 0 0", lineHeight: 1.6 }}>
              ※ 評価は全国の労働者データに基づく素点換算表(男女別)による5段階(単一質問の尺度は4段階。換算表に欄がない段階は空白)です。
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

        {ext80 && (
          <div style={{ marginTop: 20, pageBreakInside: "avoid" }}>
            <h2 style={{ fontSize: 15, color: brand.tealDark, margin: "0 0 2px" }}>
              職場環境について(80項目版の追加尺度)
            </h2>
            <p style={{ fontSize: 10.5, color: "#8A9694", margin: "0 0 8px", lineHeight: 1.7 }}>
              新職業性ストレス簡易調査票(推奨尺度セット短縮版)による結果です。
              <strong>いずれの尺度も点数が高いほど良好</strong>な状態を表します(1〜4点。点が低いほど注意が必要という向きで統一されています)。
              「情緒的負担」「役割葛藤」なども点が高いほど負担が小さいことを示します。
              この表は回答値(1〜4点)の平均で、上の<strong>ストレスプロフィール(1〜5の評価点)とは目盛りが異なります</strong>。
              「全国平均」は全国調査(1,600名超)の平均値(性別が記録されている場合は同性の平均)で、尺度ごとに異なる値になります。
              この部分は高ストレスの判定には用いず、職場環境の改善を検討するための情報です。
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                  <th style={{ textAlign: "left", padding: "6px 8px" }}>尺度</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>あなたの得点</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>全国平均</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>差</th>
                </tr>
              </thead>
              <tbody>
                {(["burden", "task", "dept", "org", "outcome"] as const).map((g) => (
                  <React.Fragment key={g}>
                    <tr>
                      <td colSpan={4} style={{ padding: "5px 8px", background: "#F4FAF9", fontWeight: 700, color: brand.tealDark }}>
                        {EXT80_GROUP_LABEL[g]}
                      </td>
                    </tr>
                    {ext80
                      .filter((s) => s.group === g)
                      .map((s) => (
                        <tr key={s.key} style={{ borderBottom: `1px solid ${brand.line}` }}>
                          <td style={{ padding: "5px 8px", color: brand.ink }}>{s.label}</td>
                          <td style={{ padding: "5px 8px", fontWeight: 700 }}>{s.score.toFixed(1)}</td>
                          <td style={{ padding: "5px 8px", color: "#5B6B6A" }}>{s.norm.toFixed(2)}</td>
                          <td
                            style={{
                              padding: "5px 8px",
                              fontWeight: 700,
                              color: s.diff <= -0.5 ? "#B02A2A" : s.diff >= 0.5 ? brand.tealDark : "#5B6B6A",
                            }}
                          >
                            {s.diff > 0 ? "+" : ""}
                            {s.diff.toFixed(1)}
                            {s.diff <= -0.5 ? "(平均より低い)" : s.diff >= 0.5 ? "(平均より高い)" : ""}
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p style={{ fontSize: 10.5, color: "#8A9694", marginTop: 18, lineHeight: 1.7 }}>
          本結果票は労働安全衛生法第66条の10に基づくストレスチェックの個人結果であり、医療上の診断ではありません。
          本人の同意なく事業者へ提供されることはありません。結果は5年間保存されます。
          <br />
          実施者: {IMPLEMENTER.full}(所属: {IMPLEMENTER.officeName} {IMPLEMENTER.officeAddress})
        </p>
      </div>

      <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        {!embedded && (
          <Link href={backHref}>
            <Btn tone="ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
              {backLabel}
            </Btn>
          </Link>
        )}
        <Btn onClick={() => window.print()} style={{ padding: "8px 16px", fontSize: 13 }}>
          印刷 / PDFとして保存
        </Btn>
      </div>
    </div>
  );
}
