// 紹介用デモの注意書き(印刷・PDFには出力されない)
export function DemoNotice() {
  return (
    <div
      className="no-print"
      style={{
        maxWidth: 900,
        margin: "0 auto 12px",
        fontSize: 12.5,
        color: "#8A6B2E",
        background: "#FBF3E3",
        border: "1px solid #EFD9A8",
        borderRadius: 10,
        padding: "10px 14px",
        lineHeight: 1.8,
      }}
    >
      <strong>サンプル(デモ)</strong>: 架空企業「モデル株式会社」の自動生成データによる表示例です。
      実在の企業・個人とは一切関係がなく、実際の受検データベースには保存されていません。
    </div>
  );
}
