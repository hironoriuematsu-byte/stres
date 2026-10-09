// 生年月日の入力チェック(登録・受検・アカウント設定で共通)。
// 値は YYYY-MM-DD(input type="date" の形式)で扱う

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// 日付として正しく、年齢が 15〜100 歳の範囲なら妥当とみなす
export function birthDateError(value: string, today: Date = new Date()): string | null {
  const v = value.trim();
  if (!v) return "生年月日を入力してください。";
  const m = RE.exec(v);
  if (!m) return "生年月日の形式が正しくありません。";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return "存在しない日付です。";
  }
  const age = ageAt(v, today);
  if (age == null || age < 15) return "生年月日をご確認ください(15歳未満になっています)。";
  if (age > 100) return "生年月日をご確認ください(100歳を超えています)。";
  return null;
}

export function ageAt(birth: string, today: Date = new Date()): number | null {
  const m = RE.exec(birth);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age -= 1;
  return age;
}

// 表示用: 1975-04-01 → 1975/4/1
export function formatBirthDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = RE.exec(value);
  if (!m) return value;
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`;
}

// input type="date" の min / max(100歳〜15歳)
export function birthDateBounds(today: Date = new Date()): { min: string; max: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (y: number) => `${y}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return { min: ymd(today.getFullYear() - 100), max: ymd(today.getFullYear() - 15) };
}

// 「birth_date 列がまだ無い」(SQL 0024 未実行)エラーかどうか
export function isMissingBirthDateColumn(message: string | undefined | null): boolean {
  return !!message && /birth_date/.test(message) && /column|schema cache|does not exist/i.test(message);
}

// ------------------------------------------------------------
// 生年月日の直接入力(カレンダーで何十年も遡らずに済むよう、数字や和暦で入力してもらう)
//   「19850304」「1985/3/4」「1985-03-04」「1985年3月4日」「S60.3.4」「昭和60年3月4日」「H1.3.24」
//   全角数字も可。読み取れなければ null。戻り値は YYYY-MM-DD
// ------------------------------------------------------------
const ERA: Record<string, number> = {
  明治: 1867, 大正: 1911, 昭和: 1925, 平成: 1988, 令和: 2018,
  m: 1867, t: 1911, s: 1925, h: 1988, r: 2018,
};

function ymd(y: number, m: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseBirthDateInput(raw: string): string | null {
  const t = (raw ?? "").normalize("NFKC").trim().replace(/\s+/g, "").replace(/元年/, "1年");
  if (!t) return null;
  // 和暦: S60.3.4 / 昭和60年3月4日 / H1/3/24
  const era = t.match(/^(明治|大正|昭和|平成|令和|[MTSHRmtshr])(\d{1,2})[年./\-](\d{1,2})[月./\-](\d{1,2})日?$/);
  if (era) {
    const base = ERA[era[1]] ?? ERA[era[1].toLowerCase()];
    return base ? ymd(base + Number(era[2]), Number(era[3]), Number(era[4])) : null;
  }
  // 数字8けた: 19850304
  const eight = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (eight) return ymd(Number(eight[1]), Number(eight[2]), Number(eight[3]));
  // 区切りあり: 1985/3/4, 1985-03-04, 1985.3.4, 1985年3月4日
  const sep = t.match(/^(\d{4})[年./\-](\d{1,2})[月./\-](\d{1,2})日?$/);
  if (sep) return ymd(Number(sep[1]), Number(sep[2]), Number(sep[3]));
  return null;
}

// 入力欄の表示用(保存済みの YYYY-MM-DD を「19850304」の形で出す)
export function birthDateInputValue(value: string | null | undefined): string {
  const m = value ? RE.exec(value) : null;
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

// 直接入力の文字列を検査する(読み取れなければ形式のエラー、読み取れれば年齢の範囲などを検査)
export function birthTextError(text: string, today: Date = new Date()): string | null {
  if (!text.trim()) return "生年月日を入力してください。";
  const v = parseBirthDateInput(text);
  if (!v) return "生年月日を数字8けた(例: 19850304)で入力してください。";
  return birthDateError(v, today);
}
