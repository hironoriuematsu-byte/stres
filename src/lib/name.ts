// 氏名の扱いを1か所にまとめる。
// 登録時・受検時・初回ログイン時のいずれでも、空白(半角・全角)だけの氏名や
// 仮の「未設定」を有効な氏名とみなさない(氏名が空のまま受検できた事例への対策)。

export const NAME_PLACEHOLDER = "未設定"; // 招待直後など、本人がまだ氏名を登録していない状態を表す仮の値

// 前後の空白を除き、連続する空白(全角含む)は半角スペース1つにそろえる
export function cleanPersonName(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\s　]+/g, " ").trim();
}

// 有効な氏名か(1文字以上あり、「未設定」でなく、長すぎない)
export function isValidPersonName(raw: string | null | undefined): boolean {
  const s = cleanPersonName(raw);
  return s.length > 0 && s.length <= 60 && s !== NAME_PLACEHOLDER;
}
