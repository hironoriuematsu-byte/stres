// 年度は4月始まり(例: 2026年3月 → 2025年度、2026年4月 → 2026年度)
export function getFiscalYear(d: Date = new Date()): number {
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

// 来年度(準備・先行配布用)+ 当年度以前
export function fiscalYearOptions(pastCount = 4): number[] {
  const cur = getFiscalYear();
  return [cur + 1, ...Array.from({ length: pastCount + 1 }, (_, i) => cur - i)];
}
