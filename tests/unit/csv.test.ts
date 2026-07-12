import { describe, it, expect } from "vitest";
import { buildCsv, resultsCsv, RESULT_CSV_HEADERS } from "@/lib/csv";
import { parseCsv, parseInviteCsv } from "@/lib/parse-csv";

describe("CSV出力(受け入れテスト6: Excelで文字化けしない)", () => {
  it("BOM付きUTF-8で始まる", () => {
    const csv = buildCsv(["a"], [["b"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("CRLF改行・日本語ヘッダー", () => {
    const csv = resultsCsv([
      {
        created_at: "2026-07-01T00:00:00Z",
        fiscal_year: 2026,
        name: "山田 太郎",
        emp_id: "10234",
        dept: "製造部",
        score_a: 40,
        score_b: 80,
        score_c: 20,
        score_d: 5,
        high_stress: true,
        consent: false,
      },
    ]);
    expect(csv).toContain("\r\n");
    expect(csv).toContain(RESULT_CSV_HEADERS.join(","));
    expect(csv).toContain("山田 太郎");
    expect(csv).toContain("高ストレス");
    expect(csv).toContain("同意なし");
  });

  it("カンマ・引用符・改行を含むフィールドをエスケープする", () => {
    const csv = buildCsv(["v"], [['a,"b"\nc']]);
    expect(csv).toContain('"a,""b""\nc"');
  });
});

describe("招待CSVパーサ(メール, 企業コード)", () => {
  it("BOM・CRLF付きCSVを読める", () => {
    const text = "\uFEFFメール,企業コード\r\nyamada@example.com,KYT001\r\nsato@example.com,KYT001\r\n";
    const rows = parseInviteCsv(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      email: "yamada@example.com",
      company_code: "KYT001",
    });
  });

  it("ヘッダー行(メール列に@なし)は無視される", () => {
    const rows = parseCsv("a,b\nc,d");
    expect(rows).toHaveLength(2);
    const invites = parseInviteCsv("メール,企業コード\nt@example.com,X1");
    expect(invites).toHaveLength(1);
    expect(invites[0].company_code).toBe("X1");
  });
});
