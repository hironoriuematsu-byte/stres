// 日本の祝日と事務所の休業日(年末年始)。営業日の計算に使う
//   祝日法に沿って計算する(固定日・ハッピーマンデー・春分/秋分・振替休日・国民の休日)。
//   オリンピックなどの特例(2020・2021年)は扱わない

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// その月の n 回目の月曜日
function nthMonday(y: number, m: number, n: number): number {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=日
  const firstMonday = first <= 1 ? 2 - first : 9 - first;
  return firstMonday + 7 * (n - 1);
}

// 春分・秋分の日(1980〜2099年の近似式)
const vernal = (y: number) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnal = (y: number) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

const dow = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();
function plusDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const cache = new Map<number, Set<string>>();

// その年の祝日(YYYY-MM-DD)
export function jpHolidays(y: number): Set<string> {
  const hit = cache.get(y);
  if (hit) return hit;
  const base = new Set<string>([
    ymd(y, 1, 1), // 元日
    ymd(y, 1, nthMonday(y, 1, 2)), // 成人の日
    ymd(y, 2, 11), // 建国記念の日
    ymd(y, 2, 23), // 天皇誕生日
    ymd(y, 3, vernal(y)), // 春分の日
    ymd(y, 4, 29), // 昭和の日
    ymd(y, 5, 3), // 憲法記念日
    ymd(y, 5, 4), // みどりの日
    ymd(y, 5, 5), // こどもの日
    ymd(y, 7, nthMonday(y, 7, 3)), // 海の日
    ymd(y, 8, 11), // 山の日
    ymd(y, 9, nthMonday(y, 9, 3)), // 敬老の日
    ymd(y, 9, autumnal(y)), // 秋分の日
    ymd(y, 10, nthMonday(y, 10, 2)), // スポーツの日
    ymd(y, 11, 3), // 文化の日
    ymd(y, 11, 23), // 勤労感謝の日
  ]);
  const all = new Set(base);
  // 振替休日: 祝日が日曜なら、その後の最初の平日(祝日でない日)
  for (const h of base) {
    if (dow(h) !== 0) continue;
    let d = plusDays(h, 1);
    while (base.has(d)) d = plusDays(d, 1);
    all.add(d);
  }
  // 国民の休日: 前日と翌日が祝日の平日(敬老の日と秋分の日の間など)
  for (const h of base) {
    const mid = plusDays(h, 1);
    if (base.has(plusDays(h, 2)) && !all.has(mid) && dow(mid) !== 0) all.add(mid);
  }
  cache.set(y, all);
  return all;
}

export const isJpHoliday = (s: string): boolean => jpHolidays(Number(s.slice(0, 4))).has(s);

// 事務所の営業日か(土日・祝日・年末年始 12/29〜1/3 を除く)
export function isBusinessDay(s: string): boolean {
  const d = dow(s);
  if (d === 0 || d === 6) return false;
  if (isJpHoliday(s)) return false;
  const md = s.slice(5);
  if (md >= "12-29" || md <= "01-03") return false;
  return true;
}

// 翌営業日(from の次の日から数える)
export function nextBusinessDay(from: string): string {
  let d = plusDays(from, 1);
  while (!isBusinessDay(d)) d = plusDays(d, 1);
  return d;
}

// from から days 日間のうちの営業日
export function businessDaysFrom(from: string, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = plusDays(from, i);
    if (isBusinessDay(d)) out.push(d);
  }
  return out;
}
