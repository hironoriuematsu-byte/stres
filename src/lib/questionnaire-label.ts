// 調査票の正式名称(帳票のヘッダ・注記で共通利用)
//   57項目版: 厚生労働省「職業性ストレス簡易調査票」
//   80項目版: 57項目に「新職業性ストレス簡易調査票(推奨尺度セット短縮版)」の23項目を加えたもの
// 「新」が当てはまるのは80項目版だけなので、企業が採用した版に合わせて表記を切り替える
export function questionnaireLabel(is80: boolean): string {
  return is80 ? "新職業性ストレス簡易調査票 短縮版(80項目)" : "職業性ストレス簡易調査票(57項目)";
}

// ロゴ横の「〜 準拠」表記
export function questionnaireCompliance(is80: boolean): string {
  return `${questionnaireLabel(is80)} 準拠`;
}
