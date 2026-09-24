// 招待CSVのパーサ。
// ダブルクォートで囲まれたフィールド・CRLF・BOMに対応した最小実装。

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

export type InviteRow = {
  email: string;
  company_code: string;
  name?: string; // 氏名(任意)。あれば招待時にプロフィールへ登録する
};

// 1行の中からメールアドレスの列を見つけ、その左の列を氏名として扱う。
// 「氏名, メール」「メール」「氏名, メール, 企業コード」「メール, 企業コード」のいずれも読める
function splitRow(r: string[]): { name?: string; email: string; rest: string[] } | null {
  const idx = r.findIndex((c) => c.includes("@"));
  if (idx < 0) return null; // ヘッダー行など
  const name = idx > 0 ? r[idx - 1].trim() : "";
  return { name: name || undefined, email: r[idx].trim(), rest: r.slice(idx + 1).map((c) => c.trim()) };
}

// 実施者用の招待CSV: 「氏名, メール, 企業コード」または「メール, 企業コード」。
// ヘッダー行(メール列に@を含まない行)は読み飛ばす。社員番号・部署は本人が受検時に入力する。
export function parseInviteCsv(text: string): InviteRow[] {
  return parseCsv(text)
    .map(splitRow)
    .filter((x): x is NonNullable<typeof x> => x !== null && x.rest.length >= 1 && x.rest[0] !== "")
    .map((x) => ({ email: x.email, company_code: x.rest[0], name: x.name }));
}

// 実施事務従事者用の招待CSV(自社固定): 「氏名, メール」または「メール」
export function parseJimuInviteCsv(text: string): { email: string; name?: string }[] {
  return parseCsv(text)
    .map(splitRow)
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map((x) => ({ email: x.email, name: x.name }));
}
