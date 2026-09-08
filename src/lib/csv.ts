// CSV生成: BOM付きUTF-8(Excelで文字化けしないこと — 仕様4.3)

import { IMPLEMENTER } from "@/lib/org";

function escapeField(v: string | number | boolean | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(headers: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(escapeField).join(","));
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export type ResultCsvRow = {
  created_at: string;
  fiscal_year: number;
  name: string;
  emp_id: string;
  dept: string;
  score_a: number;
  score_b: number;
  score_c: number;
  score_d: number;
  high_stress: boolean;
  consent: boolean;
};

export const RESULT_CSV_HEADERS = [
  "実施日",
  "年度",
  "氏名",
  "社員番号",
  "部署",
  "A",
  "B",
  "C",
  "D",
  "高ストレス判定",
  "同意有無",
];

export type ResultCsvMeta = {
  companyName: string;
  fiscalYear: number;
  interviewCount: number; // 面接指導を希望(申出)した人数
  questionnaire?: "57" | "80"; // 事業場が使用した調査票
  headcount?: number | null; // 在籍労働者数(報告書の記入欄。任意入力)
  groupAnalysisDone?: boolean | null; // 集団ごとの分析の実施の有無
};

// 検査実施年月(最後に受検した方の実施月)。報告書の「検査実施年月」欄に使う
export function examMonthLabel(rows: { created_at: string }[]): string {
  if (rows.length === 0) return "";
  const last = rows
    .map((r) => new Date(r.created_at).getTime())
    .reduce((a, b) => (b > a ? b : a), 0);
  const d = new Date(last);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function resultsCsv(rows: ResultCsvRow[], meta?: ResultCsvMeta): string {
  const body = buildCsv(
    RESULT_CSV_HEADERS,
    rows.map((r) => [
      new Date(r.created_at).toLocaleDateString("ja-JP"),
      r.fiscal_year,
      r.name,
      r.emp_id,
      r.dept,
      r.score_a,
      r.score_b,
      r.score_c,
      r.score_d,
      r.high_stress ? "高ストレス" : "該当なし",
      r.consent ? "同意あり" : "同意なし",
    ])
  );

  if (!meta) return body;

  // 冒頭に実施情報とサマリーを付ける(BOMは先頭に1つだけ)
  const highN = rows.filter((r) => r.high_stress).length;
  const highRate = rows.length ? Math.round((highN / rows.length) * 1000) / 10 : 0;
  const headerLines = [
    ["ストレスチェック結果報告書のサマリ"],
    [
      "システム",
      `ストレスチェックWeb 職業性ストレス簡易調査票(${meta.questionnaire === "80" ? "80項目" : "57項目"})準拠/${IMPLEMENTER.officeName}`,
    ],
    ["実施者名", IMPLEMENTER.full],
    ["産業医所在地", `${IMPLEMENTER.officeName} ${IMPLEMENTER.officeAddress}`],
    ["事業場名", meta.companyName],
    ["実施年度", `${meta.fiscalYear}年度`],
    // 報告書(様式第6号の2)の「検査実施年月」。最後に受検した方の実施月
    ["検査実施年月", examMonthLabel(rows)],
    ["調査票", meta.questionnaire === "80" ? "職業性ストレス簡易調査票(80項目版)" : "職業性ストレス簡易調査票(57項目版)"],
    // 人数は数値のまま出力する(Excelで数値として右揃えになる)
    ["在籍労働者数", meta.headcount ?? "(未入力)"],
    ["受検者数", rows.length],
    ["高ストレス者数", highN],
    ["高ストレス者割合", `${highRate}%`],
    ["面接指導希望者数", meta.interviewCount],
    [
      "集団ごとの分析の実施",
      meta.groupAnalysisDone == null
        ? "(不明)"
        : meta.groupAnalysisDone
          ? "有(集団分析報告書の出力記録あり)"
          : "無",
    ],
    [],
  ]
    .map((line) => line.map(escapeField).join(","))
    .join("\r\n");

  return "\uFEFF" + headerLines + "\r\n" + body.replace(/^\uFEFF/, "");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
