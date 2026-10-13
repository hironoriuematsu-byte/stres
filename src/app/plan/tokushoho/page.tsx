import Link from "next/link";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";
import { minSeats, PAYMENT_METHODS_TEXT, pricingFor } from "@/lib/plan";
import { getFiscalYear } from "@/lib/fiscal";
import { loadPlanPrices } from "@/lib/plan-prices";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "特定商取引法に基づく表記 | ストレスチェックWeb" };

function rowsFor(unitPrice: number, minTotal: number, seats: number): [string, string][] {
  return [
  ["販売事業者", `${SELLER.name}(うえまつ産業医事務所)`],
  ["適格請求書発行事業者登録番号", SELLER.invoiceRegistrationNo],
  ["運営責任者", SELLER.representative],
  ["所在地", SELLER.address],
  ["電話番号", "ご請求があれば遅滞なく開示します(下記メールアドレスまでご連絡ください)"],
  ["メールアドレス", SELLER.email],
  ["販売価格", `受検者1名あたり ${unitPrice}円(税込)、最低料金 ${minTotal.toLocaleString()}円(税込・${seats}名まで)。お申込み時点の料金をお申込み画面に表示します(申込後に料金を改定しても、お申込み済みの料金は変わりません)`],
  ["商品代金以外の必要料金", "なし(インターネットの通信料はお客さまのご負担となります)"],
  ["支払方法", PAYMENT_METHODS_TEXT],
  ["支払時期", "お申込み時に決済されます"],
  ["サービスの提供時期", "決済完了後ただちにアカウントを開設し、お申込み時に指定した開始日から受検できます"],
  ["キャンセル・返金", "サービスの性質上、お申込み後のお客さまのご都合によるキャンセル・返金はお受けできません(受検者数が申込人数に満たない場合を含みます)。ただし、二重に決済された場合や、当社の事情によりサービスを提供できない場合は返金します"],
  ["動作環境", "最新の Google Chrome / Microsoft Edge / Safari(パソコン・スマートフォン)"],
  ];
}

export default async function TokushohoPage() {
  const pricing = pricingFor(await loadPlanPrices(createClient()), getFiscalYear());
  const rows = rowsFor(pricing.unitPrice, pricing.minTotal, minSeats(pricing));
  return (
    <Card style={{ maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, color: brand.ink, margin: "0 0 12px" }}>特定商取引法に基づく表記</h1>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} style={{ borderBottom: `1px solid ${brand.line}` }}>
                <th style={{ textAlign: "left", padding: "8px 12px 8px 0", color: brand.ink, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</th>
                <td style={{ padding: "8px 0", color: "#44534F", lineHeight: 1.7 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 16 }}>
        <Link href="/plan" style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
          ← サービスのご案内へ
        </Link>
      </div>
    </Card>
  );
}
