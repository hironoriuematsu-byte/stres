import Link from "next/link";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { buildDemoPeople, DEMO_COMPANY, DEMO_FISCAL_YEAR } from "@/lib/demo-data";

export const metadata = {
  title: "サンプル(デモ) | ストレスチェックWeb",
  description: "架空企業のデータで、個人結果票と集団分析報告書のサンプルをご覧いただけます。",
};

// 広告・紹介用のデモ。ログイン不要で、架空データのみを表示する
export default function DemoTopPage({ searchParams }: { searchParams: { q?: string } }) {
  const q: "57" | "80" = searchParams.q === "80" ? "80" : "57";
  const qs = q === "80" ? "?q=80" : "";
  const people = buildDemoPeople();
  const high = people.filter((p) => p.scores.highStress).length;
  const depts = [...new Set(people.map((p) => p.dept))];

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <Badge tone="orange">サンプル(デモ)</Badge>
        <h2 style={{ fontSize: 22, color: brand.ink, margin: "12px 0 8px" }}>
          ストレスチェックWeb 結果サンプル({q === "80" ? "80項目版" : "57項目版"})
        </h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.9, margin: 0 }}>
          実際にお渡しする<strong>個人結果票</strong>と<strong>集団分析報告書</strong>を、架空の企業「{DEMO_COMPANY}」
          ({DEMO_FISCAL_YEAR}年度・{people.length}名・{depts.length}部署)のデータでご覧いただけます。
          厚生労働省「職業性ストレス簡易調査票({q === "80" ? "80項目" : "57項目"})」に準拠した判定・集計をそのまま使用しています。
        </p>
        <div
          style={{
            fontSize: 12.5,
            color: "#8A6B2E",
            background: "#FBF3E3",
            border: "1px solid #EFD9A8",
            borderRadius: 10,
            padding: "10px 14px",
            marginTop: 14,
            lineHeight: 1.8,
          }}
        >
          このページのデータは<strong>すべて架空のもの</strong>です(実在の企業・個人とは一切関係ありません)。
          デモ用に自動生成した数値で、実際の受検データベースには保存されていません。
        </div>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>調査票を選ぶ</h3>
        <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>
          厚生労働省の<strong>57項目版</strong>と、これに職場環境に関する23項目を加えた<strong>80項目版</strong>
          (新職業性ストレス簡易調査票 推奨尺度セット短縮版)のどちらでもサンプルをご覧いただけます。
          高ストレスの判定基準は両者で変わりません。80項目版では、個人結果票と集団分析報告書に
          職場の資源(上司のリーダーシップ・人事評価の公正さ・ワーク・エンゲイジメントなど22尺度)の結果が加わります。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(
            [
              ["57", "57項目版(約10分)"],
              ["80", "80項目版(約13分)"],
            ] as const
          ).map(([v, label]) => (
            <Link key={v} href={v === "80" ? "/demo?q=80" : "/demo"}>
              <button
                style={{
                  background: q === v ? brand.teal : "#fff",
                  color: q === v ? "#fff" : brand.tealDark,
                  border: `1px solid ${brand.teal}`,
                  borderRadius: 999,
                  padding: "8px 20px",
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            </Link>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#8A9694", margin: "10px 0 0" }}>
          現在の表示: <strong>{q === "80" ? "80項目版" : "57項目版"}</strong>
          (下の各サンプルはこの調査票の内容で表示されます)
        </p>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>{DEMO_COMPANY} の概要(架空)</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
          {[
            ["受検者数", `${people.length} 名`],
            ["部署数", `${depts.length} 部署`],
            ["高ストレス者数", `${high} 名`],
            ["高ストレス率", `${Math.round((high / people.length) * 1000) / 10}%`],
          ].map(([k, v]) => (
            <div key={k} style={{ border: `1px solid ${brand.line}`, borderRadius: 10, padding: "10px 18px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#5B6B6A" }}>{k}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: brand.tealDark }}>{v}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: "#5B6B6A", margin: "12px 0 0", lineHeight: 1.8 }}>
          部署: {depts.join(" / ")}
        </p>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>📝 受検の流れ(従業員が回答する画面)</h3>
        <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>
          従業員が実際に回答する画面をそのまま体験できます。受検者情報の入力から{q === "80" ? "80" : "57"}問の回答
          (A: 仕事について / B: 最近1か月の状態 / C: 周りの方々について / D: 満足度
          {q === "80" ? " / E〜H: 職場環境について" : ""})、会社への提供同意の確認、結果表示までの一連の流れです。
          スマートフォンからも同じ画面で受検でき、所要時間は約{q === "80" ? "13" : "10"}分です。
          <strong>デモの回答は保存されません</strong>(各設問画面の「残りをまとめて回答」で、流れだけを素早く確認することもできます)。
        </p>
        <Link href={`/demo/exam${qs}`}>
          <Btn>受検画面を体験する</Btn>
        </Link>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>📄 個人結果票(受検者本人にお渡しするもの)</h3>
        <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>
          領域別の得点と高ストレス判定に加え、厚労省の素点換算表(男女別)による19尺度のストレスプロフィールを
          3分類のレーダーチャートで表示します。
          {q === "80" && "80項目版では、職場の資源など22尺度の得点と全国平均との比較も加わります。"}
          印刷・PDF保存に対応しています。
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/demo/report/high${qs}`}>
            <Btn tone="orange">高ストレス判定の例を見る</Btn>
          </Link>
          <Link href={`/demo/report/normal${qs}`}>
            <Btn tone="ghost">高ストレスに該当しない例を見る</Btn>
          </Link>
        </div>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>🩺 産業医面接指導の申出(高ストレス者向け)</h3>
        <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>
          高ストレスと判定された方には、受検直後の結果画面とマイページに「面接指導を申し出る」が表示されます。
          申出をすると、本人・実施者(産業医)・実施事務従事者へ自動でメールが届き、日程調整に進みます。
          厚生労働省の指針に基づき、申出には結果を事業者へ提供することへの同意確認が組み込まれています。
        </p>
        <Link href="/demo/interview">
          <Btn tone="orange">申出フォームのサンプルを見る</Btn>
        </Link>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>📊 集団分析報告書(事業者へお渡しするもの)</h3>
        <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>
          部署別の高ストレス率、仕事のストレス判定図(健康リスク・全国平均との比較)、職場のストレスプロフィール、
          尺度別の平均評価点までを1つの報告書にまとめます。
          {q === "80" && "80項目版では、職場の資源など22尺度の部署別平均(全国平均との対比)も加わります。"}
          個人特定防止のため、10名未満の部署は集計から除外されます。
        </p>
        <Link href={`/demo/group-report${qs}`}>
          <Btn>集団分析報告書のサンプルを見る</Btn>
        </Link>
      </Card>

      <Card>
        <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8, margin: 0 }}>
          導入のご相談・お見積りは、うえまつ産業医事務所までお問い合わせください。
        </p>
        <div style={{ marginTop: 12 }}>
          <Link href="/">
            <Btn tone="ghost">トップページへ</Btn>
          </Link>
        </div>
      </Card>
    </div>
  );
}
