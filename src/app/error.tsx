"use client";

// 予期しないクライアントエラー時の復旧画面(既定の英語エラー画面の代わり)
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ maxWidth: 560, margin: "40px auto", textAlign: "center" }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid #DCE8E6",
          borderRadius: 12,
          padding: 28,
        }}
      >
        <h2 style={{ fontSize: 18, color: "#22333B", margin: "0 0 10px" }}>
          画面の表示中に問題が発生しました
        </h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 16px" }}>
          お手数ですが「再読み込み」を押してもう一度お試しください。
          ブラウザの翻訳機能をお使いの場合は、いったん翻訳を解除してから操作すると安定することがあります。
        </p>
        <button
          onClick={() => reset()}
          style={{
            background: "#0F9B8E",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "10px 24px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          再読み込み
        </button>
      </div>
    </div>
  );
}
