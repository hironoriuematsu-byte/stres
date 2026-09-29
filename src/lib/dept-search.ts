// 部署名の検索(受検画面・結果一覧の部署選択で使う)。
// 全角/半角・大文字小文字・空白の違いは無視して部分一致させる

export function normalizeDept(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function searchDepts(options: string[], query: string): string[] {
  const q = normalizeDept(query);
  if (!q) return options;
  const hits = options.filter((o) => normalizeDept(o).includes(q));
  // 前方一致を先に、その後は元の並び順
  return [
    ...hits.filter((o) => normalizeDept(o).startsWith(q)),
    ...hits.filter((o) => !normalizeDept(o).startsWith(q)),
  ];
}

export function findExactDept(options: string[], query: string): string | null {
  const q = normalizeDept(query);
  if (!q) return null;
  return options.find((o) => normalizeDept(o) === q) ?? null;
}
