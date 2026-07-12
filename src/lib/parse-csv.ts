// 招待CSV(氏名, メール, 社員番号, 部署, 企業コード)のパーサ。
// ダブルクォートで囲まれたフィールド・CRLF・BOMに対応した最小実装。

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
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
  name: string;
  email: string;
  emp_id: string;
  dept: string;
  company_code: string;
};

// ヘッダー行(氏名/メール等の見出し)があれば読み飛ばす
export function parseInviteCsv(text: string): InviteRow[] {
  const rows = parseCsv(text);
  return rows
    .filter((r) => r.length >= 5 && r[1].includes("@"))
    .map((r) => ({
      name: r[0].trim(),
      email: r[1].trim(),
      emp_id: r[2].trim(),
      dept: r[3].trim(),
      company_code: r[4].trim(),
    }));
}
