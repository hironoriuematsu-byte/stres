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
};

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
    ["ストレスチェック結果一覧"],
    ["システム", `ストレスチェックWeb 職業性ストレス簡易調査票(57項目)準拠/${IMPLEMENTER.officeName}`],
    ["実施者名", IMPLEMENTER.full],
    ["産業医所在地", `${IMPLEMENTER.officeName} ${IMPLEMENTER.officeAddress}`],
    ["事業場名", meta.companyName],
    ["実施年度", `${meta.fiscalYear}年度`],
    // 人数は数値のまま出力する(Excelで数値として右揃えになる)
    ["受検者数", rows.length],
    ["高ストレス者数", highN],
    ["高ストレス者割合", `${highRate}%`],
    ["面接指導希望者数", meta.interviewCount],
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
