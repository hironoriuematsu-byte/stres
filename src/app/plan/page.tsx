import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { IMPLEMENTER, IMPLEMENTER_PROFILE, SELLER } from "@/lib/org";
import { formatJpDate, minSeats, pricingFor, upcomingPriceChange } from "@/lib/plan";
import { getFiscalYear } from "@/lib/fiscal";
import { loadPlanPrices } from "@/lib/plan-prices";
import { createClient } from "@/lib/supabase/server";
import {
  COMPARE_HEAD,
  COMPARE_NOTE,
  compareRows,
  FAQ,
  HEADLINE,
  KEY_POINTS,
  OBLIGATION,
  OBLIGATION_DATE,
  priceExamples,
  priceNotes,
  SECURITY_POINTS,
  STEPS,
} from "./content";

export const metadata = {
  title: "ストレスチェック(50人未満・産業医がいなくても)実施者込み・集団分析込み | ストレスチェックWeb",
  description:
    "産業医が実施者を務めるWebストレスチェック。50人未満の事業場の義務化に。QRコードを配るだけで当日から実施でき、個人の結果は人事に渡りません。受検者1名あたりの料金で集団分析込み。",
  keywords: ["ストレスチェック", "50人未満", "義務化", "産業医", "実施者", "集団分析", "Web", "小規模事業場"],
};

const h2 = { fontSize: 18, color: brand.tealDark, margin: "0 0 10px" } as const;
const small = { fontSize: 12, color: "#7A8886", lineHeight: 1.7 } as const;
const cta = {
  background: brand.orange,
  color: "#fff",
  borderRadius: 10,
  padding: "11px 22px",
  fontWeight: 700,
  fontSize: 15,
  textDecoration: "none",
} as const;
const sub = { ...cta, background: "#fff", color: brand.tealDark, border: `1px solid ${brand.teal}` } as const;

export default async function PlanPage() {
  // 料金は年度ごとの設定(plan_prices)から表示する。次の年度以降の改定があれば、あらかじめお知らせする
  const prices = await loadPlanPrices(createClient());
  const year = getFiscalYear();
  const pricing = pricingFor(prices, year);
  const change = upcomingPriceChange(prices, year);

  // 検索結果に「よくある質問」を表示できるよう、構造化データを入れる
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />

      {/* 1. ひと目で伝わる最初の画面 */}
      <Card>
        <Badge tone="orange">2028年4月から 50人未満の事業場も義務化</Badge>
        <h1 style={{ fontSize: 26, color: brand.ink, margin: "12px 0 14px", lineHeight: 1.45 }}>{HEADLINE}</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {KEY_POINTS.map((k) => (
            <div key={k.title} style={{ background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: brand.tealDark }}>✓ {k.title}</div>
              <div style={{ fontSize: 13, color: "#44534F", lineHeight: 1.7, marginTop: 2 }}>{k.text}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 15, color: brand.ink, margin: "16px 0 4px" }}>
          受検者1名 <strong style={{ fontSize: 26, color: brand.tealDark }}>{pricing.unitPrice}円</strong>
          <span style={{ fontSize: 13, color: "#5B6B6A" }}>
            {" "}
            (税込・集団分析込み。{minSeats(pricing)}名までは{pricing.minTotal.toLocaleString()}円)
          </span>
        </p>
        {change && (
          <p style={{ fontSize: 12.5, color: "#8A5A00", margin: "0 0 4px" }}>
            料金改定のお知らせ: {change.fiscal_year}年度({formatJpDate(`${change.fiscal_year}-04-01`)}以降に受検を始めるお申込み)から、1名
            {change.pricing.unitPrice}円・最低料金{change.pricing.minTotal.toLocaleString()}円になります。
          </p>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <Link href="/plan/signup" style={cta}>
            会社を登録して申し込む
          </Link>
          <Link href="/demo" style={sub}>
            デモを体験する
          </Link>
          <Link href="/plan/brochure" style={sub}>
            社内検討用の資料(PDF)
          </Link>
        </div>
        <p style={{ ...small, margin: "12px 0 0" }}>
          登録済みの企業さまは<Link href="/login?next=/jimu" style={{ color: brand.tealDark, fontWeight: 700 }}>ログイン</Link>
          して申し込めます。当事務所と産業医契約のある企業さまは、お申込み不要です(いつもの窓口へご連絡ください)。
        </p>
      </Card>

      {/* 2. 義務化 */}
      <Card style={{ background: "#FFFBF2", borderColor: "#F0D9A8" }}>
        <h2 style={{ ...h2, color: "#8A5A00" }}>{OBLIGATION_DATE}から、50人未満の事業場も義務化</h2>
        <p style={{ fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: 0 }}>
          {OBLIGATION}このサービスなら、実施者を含めて1名{pricing.unitPrice}円から準備できます。
        </p>
      </Card>

      {/* 3. 画面のサンプル */}
      <Card>
        <h2 style={h2}>実際の画面</h2>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.7fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 12, alignItems: "start" }} className="plan-samples">
          {[
            { src: "/plan/sample-exam.jpg", cap: "受検(スマートフォン)", w: 748, h: 920 },
            { src: "/plan/sample-report.jpg", cap: "本人の結果票(受検直後に表示)", w: 1290, h: 1245 },
            { src: "/plan/sample-group.jpg", cap: "集団分析報告書(会社向け)", w: 1140, h: 1350 },
          ].map((s) => (
            <figure key={s.src} style={{ margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.src}
                alt={s.cap}
                width={s.w}
                height={s.h}
                loading="lazy"
                style={{ width: "100%", height: "auto", border: `1px solid ${brand.line}`, borderRadius: 8 }}
              />
              <figcaption style={{ fontSize: 12.5, color: "#44534F", marginTop: 4, textAlign: "center" }}>{s.cap}</figcaption>
            </figure>
          ))}
        </div>
        <p style={{ ...small, margin: "8px 0 0" }}>
          架空の会社のサンプルです。<Link href="/demo" style={{ color: brand.tealDark, fontWeight: 700 }}>デモ</Link>で受検から報告書までを操作できます。
        </p>
      </Card>

      {/* 4. 料金(例) */}
      <Card>
        <h2 style={h2}>料金の例(税込)</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 14, minWidth: 360 }}>
            <thead>
              <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                {["受検人数", "お支払い金額", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "7px 14px 7px 10px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {priceExamples(pricing).map((r) => (
                <tr key={r.seats} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <td style={{ padding: "7px 14px 7px 10px" }}>{r.seats}名</td>
                  <td style={{ padding: "7px 14px 7px 10px", fontWeight: 700, color: brand.tealDark }}>{r.total.toLocaleString()}円</td>
                  <td style={{ padding: "7px 10px", fontSize: 12.5, color: "#5B6B6A" }}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {priceNotes(pricing).map((t) => (
            <li key={t} style={{ fontSize: 12.5, color: "#5B6B6A", lineHeight: 1.8 }}>{t}</li>
          ))}
        </ul>
      </Card>

      {/* 5. 3ステップ */}
      <Card>
        <h2 style={h2}>始め方は3ステップ</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {STEPS.map((s, i) => (
            <div key={s.title} style={{ border: `1px solid ${brand.line}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", background: brand.teal, borderRadius: 999, width: 24, height: 24, display: "grid", placeItems: "center" }}>
                {i + 1}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: brand.ink, margin: "6px 0 2px" }}>{s.title}</div>
              <div style={{ fontSize: 13, color: "#44534F", lineHeight: 1.7 }}>{s.text}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 6. 比較 */}
      <Card>
        <h2 style={h2}>ほかの方法との違い</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 600, width: "100%" }}>
            <thead>
              <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                {COMPARE_HEAD.map((t) => (
                  <th key={t} style={{ textAlign: "left", padding: "8px 10px", whiteSpace: "nowrap" }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareRows(pricing).map((r) => (
                <tr key={r[0]} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: brand.ink, whiteSpace: "nowrap" }}>{r[0]}</th>
                  <td style={{ padding: "8px 10px", color: "#5B6B6A" }}>{r[1]}</td>
                  <td style={{ padding: "8px 10px", color: "#5B6B6A" }}>{r[2]}</td>
                  <td style={{ padding: "8px 10px", color: brand.tealDark, fontWeight: 700, background: "#F4FAF9" }}>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ ...small, margin: "8px 0 0" }}>{COMPARE_NOTE}</p>
      </Card>

      {/* 7. 運営者と安全管理 */}
      <Card>
        <h2 style={h2}>運営者と安全管理</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          {IMPLEMENTER_PROFILE.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={IMPLEMENTER_PROFILE.photo} alt={`実施者 ${IMPLEMENTER.name}`} width={120} height={150} style={{ borderRadius: 10, objectFit: "cover" }} />
          )}
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: brand.ink }}>実施者: {IMPLEMENTER.full}</div>
            <div style={{ fontSize: 13, color: "#44534F", lineHeight: 1.8 }}>
              運営: {SELLER.name}{IMPLEMENTER.officeName}
              <br />
              {SELLER.address}
            </div>
            {IMPLEMENTER_PROFILE.career.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {IMPLEMENTER_PROFILE.career.map((c) => (
                  <span key={c} style={{ fontSize: 12.5, color: brand.tealDark, border: `1px solid ${brand.line}`, background: "#F4FAF9", borderRadius: 999, padding: "3px 10px" }}>
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <ul style={{ margin: "10px 0 0", paddingLeft: 18 }}>
          {SECURITY_POINTS.map((t) => (
            <li key={t} style={{ fontSize: 13, color: "#44534F", lineHeight: 1.8 }}>{t}</li>
          ))}
        </ul>
      </Card>

      {/* 8. よくある質問(開いて読む形にして、ページを短くする) */}
      <Card>
        <h2 style={h2}>よくあるご質問</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} style={{ borderBottom: `1px solid ${brand.line}`, padding: "8px 0" }}>
            <summary style={{ fontSize: 14, fontWeight: 700, color: brand.ink, cursor: "pointer" }}>{q}</summary>
            <div style={{ fontSize: 14, color: "#44534F", lineHeight: 1.8, marginTop: 6 }}>{a}</div>
          </details>
        ))}
      </Card>

      {/* 9. 申込 */}
      <div style={{ textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/plan/signup" style={{ ...cta, fontSize: 16, padding: "12px 28px" }}>
            会社を登録して申し込む
          </Link>
        </div>
        <div style={{ fontSize: 12, color: "#5B6B6A" }}>
          <Link href="/plan/terms" style={{ color: brand.tealDark }}>利用規約</Link>
          {" ・ "}
          <Link href="/plan/tokushoho" style={{ color: brand.tealDark }}>特定商取引法に基づく表記</Link>
          {" ・ "}
          <Link href="/privacy" style={{ color: brand.tealDark }}>個人情報の取扱いについて</Link>
        </div>
      </div>
    </div>
  );
}
