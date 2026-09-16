// グラフの縦軸(部署名)の幅を、いちばん長いラベルに合わせて決める。
// 固定幅だと「ＡＲＣ京都日本語学校 教務部」のような長い部署名の先頭が切れるため。
// 全角1文字をおおよそ fontSize px、半角を半分として概算し、上限を設けてグラフ本体の幅を確保する。
export function yAxisWidthFor(labels: string[], fontSize: number, min = 110, max = 320): number {
  let longest = 0;
  for (const label of labels) {
    let w = 0;
    for (const ch of label) {
      // 半角(英数・記号・半角カナ)は約半分の幅
      w += /[\x20-\x7E｡-ﾟ]/.test(ch) ? fontSize * 0.55 : fontSize;
    }
    if (w > longest) longest = w;
  }
  return Math.min(max, Math.max(min, Math.ceil(longest) + 16));
}
