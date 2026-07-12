// 年度は4月始まり(例: 2026年3月 → 2025年度、2026年4月 → 2026年度)
export function getFiscalYear(d: Date = new Date()): number {
  return d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fiscalYearOptions(count = 5): number[] {
  const cur = getFiscalYear();
  return Array.from({ length: count }, (_, i) => cur - i);
}
