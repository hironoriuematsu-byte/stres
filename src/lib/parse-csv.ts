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
  email: string;
  company_code: string;
};

// 招待CSVは「メール, 企業コード」の2列。
// ヘッダー行(メール列に@を含まない行)は読み飛ばす。
// 氏名・社員番号・部署は本人が受検時に入力するため、招待時には扱わない。
export function parseInviteCsv(text: string): InviteRow[] {
  const rows = parseCsv(text);
  return rows
    .filter((r) => r.length >= 2 && r[0].includes("@"))
    .map((r) => ({
      email: r[0].trim(),
      company_code: r[1].trim(),
    }));
}
