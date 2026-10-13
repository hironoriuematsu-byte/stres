import Link from "next/link";
import { brand } from "@/lib/brand";
import { IMPLEMENTER, IMPLEMENTER_PROFILE, SELLER } from "@/lib/org";
import { formatJpDate, pricingFor, upcomingPriceChange } from "@/lib/plan";
import { getFiscalYear } from "@/lib/fiscal";
import { loadPlanPrices } from "@/lib/plan-prices";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/PrintButton";
import { HEADLINE, KEY_POINTS, OBLIGATION, priceExamples, priceNotes, SECURITY_POINTS, STEPS } from "../content";

export const metadata = { title: "社内検討用資料 | ストレスチェックWeb" };

// 社内検討(稟議)用の資料。A4で印刷・PDF保存して、そのまま添付できる。文面は宣伝ページと共通(../content.ts)
export default async function BrochurePage() {
  const prices = await loadPlanPrices(createClient());
  const year = getFiscalYear();
  const pricing = pricingFor(prices, year);
  const change = upcomingPriceChange(prices, year);
  const h = { fontSize: 14.5, color: brand.tealDark, margin: "10px 0 4px", borderLeft: `4px solid ${brand.teal}`, paddingLeft: 8 } as const;
  const t = { fontSize: 12.5, color: "#2C3B39", lineHeight: 1.65, margin: 0 } as const;
  const cell = { border: "1px solid #C9D6D4", padding: "2px 10px", fontSize: 12.5 } as const;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .brochure { border: none !important; padding: 0 !important; }
        }
        @page { size: A4; margin: 12mm 14mm; }
      `}</style>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Link href="/plan" style={{ fontSize: 13, color: brand.tealDark }}>← サービスのご案内に戻る</Link>
        <PrintButton />
      </div>

      <div className="brochure" style={{ background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 12, padding: "28px 32px", color: "#1F2D2B" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#5B6B6A" }}>ストレスチェックWeb 導入検討資料</div>
            <h1 style={{ fontSize: 21, margin: "4px 0 0", lineHeight: 1.4 }}>{HEADLINE}</h1>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="mestate" width={64} height={64} style={{ objectFit: "contain" }} />
        </div>

        <h2 style={h}>このサービスの特長</h2>
        <ul style={{ ...t, paddingLeft: 18 }}>
          {KEY_POINTS.map((k) => (
            <li key={k.title}>
              <strong>{k.title}</strong>: {k.text}
            </li>
          ))}
          <li>
            <strong>結果はその場で本人へ</strong>: レーダーチャート・アドバイス付きの結果票を受検直後に表示します。
          </li>
          <li>
            <strong>集団分析が標準</strong>: 部署別集計・仕事のストレス判定図・健康リスクの報告書(10名未満の集団は除外)。
          </li>
        </ul>

        <h2 style={h}>なぜ今か</h2>
        <p style={t}>{OBLIGATION}</p>

        <h2 style={h}>料金(税込)</h2>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <table style={{ borderCollapse: "collapse" }}>
            <tbody>
              {priceExamples(pricing).map((r) => (
                <tr key={r.seats}>
                  <td style={cell}>{r.seats}名</td>
                  <td style={{ ...cell, fontWeight: 700, textAlign: "right" }}>{r.total.toLocaleString()}円</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul style={{ ...t, paddingLeft: 18, flex: 1, minWidth: 260 }}>
            {priceNotes(pricing).map((n) => (
              <li key={n}>{n}</li>
            ))}
            {change && (
              <li>
                {change.fiscal_year}年度({formatJpDate(`${change.fiscal_year}-04-01`)}以降に受検開始)から1名{change.pricing.unitPrice}円・最低料金
                {change.pricing.minTotal.toLocaleString()}円に改定予定
              </li>
            )}
          </ul>
        </div>

        <h2 style={h}>導入の流れ</h2>
        <ol style={{ ...t, paddingLeft: 20 }}>
          {STEPS.map((s) => (
            <li key={s.title}>
              <strong>{s.title}</strong>: {s.text}
            </li>
          ))}
        </ol>

        <h2 style={h}>法令上の位置づけ(労働安全衛生法第66条の10)</h2>
        <ul style={{ ...t, paddingLeft: 18 }}>
          <li>実施者は医師・保健師などに限られます。このサービスでは{IMPLEMENTER.full}が実施者を務めます。</li>
          <li>個人の結果は、本人の同意なく事業者に提供されません。会社には本人が同意した結果と集団分析をお渡しします。</li>
          <li>
            事業者にお願いすること: 実施方法の決定と従業員への周知(50人以上は衛生委員会で調査審議)、社内の担当者(人事権のない方)の選任、
            面接指導の申出への対応、不利益な取扱いの禁止、50人以上の事業場は労働基準監督署への報告(数値は画面で自動集計)。
          </li>
        </ul>

        <h2 style={h}>運営者・安全管理</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {IMPLEMENTER_PROFILE.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={IMPLEMENTER_PROFILE.photo} alt={`実施者 ${IMPLEMENTER.name}`} width={56} height={70} style={{ borderRadius: 6, objectFit: "cover" }} />
          )}
          <p style={t}>
            実施者: {IMPLEMENTER.full}({IMPLEMENTER.officeName})
            {IMPLEMENTER_PROFILE.career.length > 0 && <> ・ {IMPLEMENTER_PROFILE.career.join(" / ")}</>}
            <br />
            運営: {SELLER.name}({SELLER.address})
          </p>
        </div>
        <ul style={{ ...t, paddingLeft: 18 }}>
          {SECURITY_POINTS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>

        <div style={{ marginTop: 16, paddingTop: 10, borderTop: `1px solid ${brand.line}`, fontSize: 12.5, color: "#44534F", lineHeight: 1.7 }}>
          お申込み・詳しい内容: https://stres.mestate.jp/plan ・ デモ: https://stres.mestate.jp/demo
          <br />
          お問い合わせ: {SELLER.email}(オンラインでのご説明も承ります) ・ 作成日: {formatJpDate(new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10))}
        </div>
      </div>
    </div>
  );
}
