// 画面の切り替え中(サーバーでデータを集めている間)に表示する。
// 押した直後にこの画面へ切り替わるため、固まっているように見えない
export default function Loading() {
  return (
    <div className="loading-box" aria-busy="true">
      <div className="loading-spinner" />
      <div>読み込んでいます…</div>
    </div>
  );
}
