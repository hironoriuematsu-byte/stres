// 検索のときの文字の比べ方を1か所にまとめる。
// 姓と名の間の空白(半角・全角・なし)、全角/半角の英数字、大文字/小文字の違いは無視して一致させる
// (「上松 正和」「上松　正和」「上松正和」のどれで探しても同じ結果になるように)
export function searchKey(s: string | null | undefined): string {
  return (s ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

// 検索語が、候補のどれかに(部分一致で)含まれるか
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const q = searchKey(query);
  if (!q) return true;
  return fields.some((f) => searchKey(f).includes(q));
}
