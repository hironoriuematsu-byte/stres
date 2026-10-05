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
