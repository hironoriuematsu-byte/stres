import { CSSProperties, ReactNode } from "react";

// 帳票(個人結果票・集団分析報告書・様式転記用)の枠。
//
// 印刷では @page の余白を0にしてブラウザのヘッダー/フッター(URL・日付・題名)を印字させていないため、
// 帳票側で余白を取る必要がある。ただし div の padding は最初と最後のページにしか付かず、
// 2ページ目以降は上下の余白が無くなってしまう。
// 表の thead / tfoot はページをまたぐとき各ページで繰り返し印字されるので、
// 空の thead / tfoot を上下の余白として使う(左右の余白は .report-sheet の padding で各ページに付く)。
// 画面上では thead / tfoot を出さず、ふつうの枠として表示する(globals.css の .print-sheet)。
export function PrintSheet({
  margin = "12mm",
  style,
  children,
}: {
  margin?: string; // 印刷時の上下の余白
  style?: CSSProperties; // 画面上の枠(.report-sheet)の見た目
  children: ReactNode;
}) {
  return (
    <table className="print-sheet">
      <thead>
        <tr>
          <td>
            <div style={{ height: margin }} />
          </td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <div className="report-sheet" style={style}>
              {children}
            </div>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td>
            <div style={{ height: margin }} />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
