import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { IMPLEMENTER } from "@/lib/org";
import { formatJpDate, INTERVIEW_FEE, minSeats, PAYMENT_METHODS_TEXT, pricingFor, QUOTE_MAILTO, upcomingPriceChange, WEB_MAX_SEATS } from "@/lib/plan";
import { getFiscalYear } from "@/lib/fiscal";
import { loadPlanPrices } from "@/lib/plan-prices";
import { createClient } from "@/lib/supabase/server";
import { PriceCalculator } from "./PriceCalculator";

export const metadata = {
  title: "Web申込 | ストレスチェックWeb",
  description: "産業医が実施者を務めるWebストレスチェック。受検者1名あたりの料金で集団分析込み。Webでその場でお申込みいただけます。",
};

const h2 = { fontSize: 18, color: brand.tealDark, margin: "0 0 10px" } as const;
const p = { fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "0 0 8px" } as const;
const li = { fontSize: 14, color: "#44534F", lineHeight: 1.9 } as const;

export default async function PlanPage() {
  // 料金は年度ごとの設定(plan_prices)から表示する。次の年度以降の改定があれば、あらかじめお知らせする
  const prices = await loadPlanPrices(createClient());
  const year = getFiscalYear();
  const pricing = pricingFor(prices, year);
  const UNIT_PRICE = pricing.unitPrice;
  const MIN_TOTAL = pricing.minTotal;
  const MIN_TOTAL_SEATS = minSeats(pricing);
  const change = upcomingPriceChange(prices, year);
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card>
        <Badge tone="orange">Web申込</Badge>
        <h1 style={{ fontSize: 24, color: brand.ink, margin: "12px 0 8px", lineHeight: 1.5 }}>
          産業医が実施者を務める
          <br />
          Webストレスチェック
        </h1>
        <p style={{ ...p, fontSize: 15 }}>
          受検者1名 <strong style={{ fontSize: 22, color: brand.tealDark }}>{UNIT_PRICE}円</strong>
          ・最低料金 <strong style={{ fontSize: 22, color: brand.tealDark }}>{MIN_TOTAL.toLocaleString()}円</strong>（いずれも税込・集団分析込み）
        </p>
        <p style={p}>
          産業医を選任していない事業場、産業医と顧問契約のない企業さま向けのプランです。
          会社を登録(無料)したあと、受検予定人数と受検期間を入れてお支払いいただくと、すぐに受検の準備が整います。2年目以降はログインして同じ画面から申し込めます。
          少人数の事業場でも、人数分だけのご負担で実施できます。
        </p>
        <p style={{ ...p, fontSize: 13, background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "10px 12px", marginTop: 12 }}>
          うえまつ産業医事務所と産業医の契約をいただいている企業さまは、このお申込みは不要です(ストレスチェックは契約に含まれます)。
          実施をご希望の際は、いつもの窓口までご連絡ください。
        </p>
        <p style={{ ...p, fontSize: 13, background: "#FBF3E3", border: "1px solid #EFD9A8", borderRadius: 10, padding: "10px 12px" }}>
          <strong>すでにご登録の企業さま(2年目以降)：</strong>
          <Link href="/login?next=/jimu" style={{ color: brand.tealDark, fontWeight: 700 }}>
            ログイン
          </Link>
          して、ログイン後の画面からお申し込みください(会社の登録は最初の1回だけです)。
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <Link href="/plan/signup" style={{ background: brand.orange, color: "#fff", borderRadius: 10, padding: "11px 22px", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
            会社を登録して申し込む
          </Link>
          <Link href="/demo" style={{ background: "#fff", color: brand.tealDark, border: `1px solid ${brand.teal}`, borderRadius: 10, padding: "10px 22px", fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
            デモを体験する
          </Link>
        </div>
      </Card>

      <Card>
        <h2 style={h2}>料金</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 14, minWidth: 420 }}>
            <tbody>
              {[
                ["受検者1名あたり", `${UNIT_PRICE}円（税込）`],
                ["最低料金", `${MIN_TOTAL.toLocaleString()}円（税込・${MIN_TOTAL_SEATS}名まで）`],
                ["受検人数の追加", `1名 ${UNIT_PRICE}円（税込）・受検期間中に画面から追加できます`],
                [`${WEB_MAX_SEATS}名を超える場合`, "個別にお見積りします（割引があります）。メールでお問い合わせください"],
                ["受検期間の延長", "無料（開始から3か月まで）"],
                ["集団分析報告書", "料金に含まれます"],
                ["産業医面接指導（当事務所が担当する場合）", `1回 ${INTERVIEW_FEE.toLocaleString()}円（税込）・申出があった方のみ`],
                ["キャンセル・返金", "お申込み後のお客さまのご都合によるキャンセル・返金はお受けできません(二重に決済された場合・当社の事情で提供できない場合を除きます)"],
              ].map(([k, v]) => (
                <tr key={k} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <th style={{ textAlign: "left", padding: "8px 12px 8px 0", color: brand.ink, whiteSpace: "nowrap" }}>{k}</th>
                  <td style={{ padding: "8px 0", color: "#44534F" }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {change && (
          <p style={{ fontSize: 13, color: "#8A5A00", background: "#FFF8E6", border: "1px solid #F0D9A8", borderRadius: 8, padding: "8px 12px", lineHeight: 1.7, margin: "8px 0 0" }}>
            料金改定のお知らせ: {change.fiscal_year}年度（{formatJpDate(`${change.fiscal_year}-04-01`)}以降に受検を始めるお申込み）から、受検者1名{" "}
            {change.pricing.unitPrice}円・最低料金 {change.pricing.minTotal.toLocaleString()}円（税込）になります。
          </p>
        )}
        <div style={{ marginTop: 14 }}>
          <PriceCalculator pricing={pricing} />
        </div>
        <p style={{ fontSize: 13, margin: "10px 0 0" }}>
          {WEB_MAX_SEATS}名を超える場合のお見積り:{" "}
          <a href={QUOTE_MAILTO} style={{ color: brand.tealDark, fontWeight: 700 }}>
            support@mestate.jp
          </a>
        </p>
        <p style={{ fontSize: 12, color: "#8A9694", lineHeight: 1.8, margin: "10px 0 0" }}>
          お支払いは{PAYMENT_METHODS_TEXT}（前払い）です。領収書は決済後にメールでお送りします。
          料金は受検を始める日の年度のものです。年度ごとに見直す場合があり、改定するときはこのページであらかじめお知らせします。
        </p>
      </Card>

      <Card>
        <h2 style={h2}>選ばれる理由</h2>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li style={li}>
            <strong>産業医が実施者を務めます。</strong>
            ストレスチェックの実施者は医師・保健師などに限られます。無料のツールは仕組みの提供が中心で、実施者は自社で確保する必要がありますが、このサービスは実施者込みです。
          </li>
          <li style={li}>
            <strong>個人の結果が社内に残りません。</strong>
            結果は実施者のもとで管理し、会社には本人が同意した結果と、個人が特定されない集団分析だけをお渡しします。社内の担当者が個人の結果を扱う負担と不安がありません。
          </li>
          <li style={li}>
            <strong>お申込みの当日から始められます。</strong>
            ソフトのインストールや従業員の名簿登録は不要です。受検用のQRコードを配るだけで、従業員の皆さまがスマートフォンから自分で登録・受検します。
          </li>
          <li style={li}>
            <strong>受検した方に、その場で分かりやすい結果を返します。</strong>
            レーダーチャート・尺度別の評価・アドバイスを受検直後に表示し、結果票は印刷・PDF保存もできます。
          </li>
          <li style={li}>
            <strong>高ストレスの方への対応までつながります。</strong>
            面接指導の申出を受け付け、当事務所の医師による面接指導(意見書込み)や、地域産業保健センターのご案内までご用意しています。
          </li>
          <li style={li}>
            <strong>80項目版で、職場環境まで把握できます(同じ料金)。</strong>
            標準の57項目に23項目を加えた「新職業性ストレス簡易調査票(80項目版)」にも対応しています。
            上司の公正な態度、ほめてもらえる職場、失敗を認める職場、経営層との信頼関係、職場のハラスメント、職場の一体感、ワーク・エンゲイジメントなど、
            職場環境の強みと課題を部署ごとに全国平均と比べられます。
          </li>
          <li style={li}>
            <strong>職場改善に使える集団分析が標準です。</strong>
            部署別の集計に加え、仕事のストレス判定図・健康リスク(全国平均=100)を報告書でお渡しします。
          </li>
          <li style={li}>
            <strong>少人数でも人数分だけ。</strong>
            1名{UNIT_PRICE}円({MIN_TOTAL_SEATS}名までは{MIN_TOTAL.toLocaleString()}円)。結果の5年間の保存も料金に含まれます。
          </li>
        </ol>
      </Card>

      <Card>
        <h2 style={h2}>ほかの方法との違い</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: 640, width: "100%" }}>
            <thead>
              <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
                {["", "厚生労働省の無料プログラム", "ほかのストレスチェック提供会社", "このサービス"].map((t) => (
                  <th key={t} style={{ textAlign: "left", padding: "8px 10px", whiteSpace: "nowrap" }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["費用", "無料", "サービス・人数により異なる(初期費用・最低料金・集団分析が別料金の場合も)", `1名${UNIT_PRICE}円(${MIN_TOTAL_SEATS}名まで${MIN_TOTAL.toLocaleString()}円)。集団分析込み`],
                ["調査票", "57項目版・23項目版", "57項目版が中心(80項目版は別料金・未対応の場合も)", "57項目版・80項目版(職場環境の23項目を追加。同じ料金)"],
                ["実施者(医師など)", "自社で確保が必要", "サービスにより異なる(自社の産業医が実施者となる場合も)", "産業医が実施者を務める"],
                ["始め方", "Windowsのパソコンにインストールして運用", "見積り・契約のあとに開始(従業員名簿の登録が必要な場合も)", "申込当日から。QRコードを配るだけ"],
                ["本人への結果", "実施者が出力して通知", "サービスにより異なる(後日の通知の場合も)", "受検直後に表示(アドバイス・結果票付き)"],
                ["個人の結果の管理", "社内の担当者が管理", "サービスにより異なる", "実施者のもとで管理(会社へは本人同意分のみ)"],
                ["面接指導", "自社で医師を手配", "オプション・別契約の場合も", `当事務所の医師(1回${INTERVIEW_FEE.toLocaleString()}円)・地域産業保健センターのご案内`],
                ["集団分析", "あり", "あり(別料金・内容はサービスにより異なる)", "あり(判定図・健康リスク・部署別)"],
              ].map((r) => (
                <tr key={r[0]} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <th style={{ textAlign: "left", padding: "8px 10px", color: brand.ink, whiteSpace: "nowrap", verticalAlign: "top" }}>{r[0]}</th>
                  <td style={{ padding: "8px 10px", color: "#5B6B6A", verticalAlign: "top" }}>{r[1]}</td>
                  <td style={{ padding: "8px 10px", color: "#5B6B6A", verticalAlign: "top" }}>{r[2]}</td>
                  <td style={{ padding: "8px 10px", color: brand.tealDark, fontWeight: 700, verticalAlign: "top", background: "#F4FAF9" }}>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: "#8A9694", lineHeight: 1.8, margin: "8px 0 0" }}>
          ほかの提供会社の内容は各社・プランにより異なります。上の表は一般的な傾向を示したもので、特定の会社のサービスを指すものではありません。
          すでに社内に産業医・保健師がいて、実施者や個人情報の管理を社内で担える場合は、無料の方法も有力な選択肢です。
          このサービスは、実施者の確保や個人の結果の管理を社内で行うのが難しい企業さま向けです。
          このサービスの調査票と高ストレスの判定基準は、厚生労働省のマニュアルに基づく標準的なものです。
        </p>
      </Card>

      <Card>
        <h2 style={h2}>含まれるもの</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={li}>
            <strong>実施者</strong>：{IMPLEMENTER.full}（{IMPLEMENTER.officeName}）が実施者を務めます
          </li>
          <li style={li}>
            <strong>Web受検</strong>：スマートフォン・パソコンから受検（厚生労働省「職業性ストレス簡易調査票」57項目版、または80項目版）
          </li>
          <li style={li}>
            <strong>結果の通知</strong>：受検後すぐに本人へ結果を表示。レーダーチャート・アドバイス付きの個人結果票（印刷・PDF保存可）
          </li>
          <li style={li}>
            <strong>高ストレス者への対応</strong>：高ストレス判定と、本人からの産業医面接指導の申出の受付
          </li>
          <li style={li}>
            <strong>集団分析報告書</strong>：部署別の集計・仕事のストレス判定図・健康リスク（10名未満の集団は個人が特定されないよう集計から除外）
          </li>
          <li style={li}>
            <strong>労働基準監督署への報告書</strong>：様式第6号の3に転記する数値を自動で集計（50人以上の事業場）
          </li>
          <li style={li}>
            <strong>5年間の保存</strong>：結果は法令に基づき5年間保存し、本人はいつでも結果を確認できます
          </li>
        </ul>
      </Card>

      <Card>
        <h2 style={h2}>受検期間</h2>
        <p style={p}>
          開始日と締切日はお申込み時に自由に決められます（標準は4週間）。締切が近づいても受検していない方がいる場合は、
          開始から3か月まで、担当者の画面から<strong>無料で</strong>締切を延ばせます。1回のお申込みで、その年度の1回分のストレスチェックを実施できます。
        </p>
      </Card>

      <Card>
        <h2 style={h2}>産業医面接指導</h2>
        <p style={p}>
          高ストレスと判定された方から申出があった場合、事業者には医師による面接指導を行う義務があります。お申込み時に、次のいずれかをお選びください。
        </p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={li}>当事務所の医師が行う：1回 {INTERVIEW_FEE.toLocaleString()}円（税込）。オンライン可・意見書込み。実施後にご請求します</li>
          <li style={li}>自社の産業医が行う：申出の通知が会社の担当者に届きます</li>
          <li style={li}>地域産業保健センター（無料）を利用する：50人未満の事業場が対象です</li>
        </ul>
      </Card>

      <Card>
        <h2 style={h2}>ご利用の流れ</h2>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li style={li}>会社(事業場)とご担当者さまを登録(無料)。確認メールのリンクからログイン</li>
          <li style={li}>ログイン後の画面で、受検予定人数・受検期間を入れてお支払い</li>
          <li style={li}>受検用のURL・QRコードを従業員の皆さまにお知らせ</li>
          <li style={li}>従業員の皆さまが受検(結果はその場で本人に表示されます)</li>
          <li style={li}>締切後、集団分析報告書をご覧いただけます</li>
        </ol>
      </Card>

      <Card>
        <h2 style={h2}>事業者さまにお願いすること</h2>
        <p style={p}>ストレスチェックは労働安全衛生法に基づく制度です。次の点は事業者さまに行っていただく必要があります。</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          <li style={li}>実施方法（実施者・受検期間・結果の取扱い）を決め、従業員の皆さまに周知すること（50人以上の事業場は衛生委員会で調査審議）</li>
          <li style={li}>社内の窓口となるご担当者（実施事務従事者）を決めること。人事権（解雇・昇進・異動の決定権）のない方に限られます</li>
          <li style={li}>面接指導の申出があった場合に面接指導を行い、医師の意見を聴いて必要な措置を講じること</li>
          <li style={li}>受検の有無・結果・申出を理由に、不利益な取扱いをしないこと</li>
        </ul>
        <p style={{ ...p, marginTop: 8 }}>
          個人の結果は、本人の同意がない限り会社に提供されません。
        </p>
      </Card>

      <Card>
        <h2 style={h2}>よくあるご質問</h2>
        {[
          ["産業医がいなくても実施できますか？", "はい。当事務所の医師が実施者を務めます。50人未満の事業場も、法改正によりストレスチェックが義務化される予定です。"],
          ["受検しない従業員の分も払う必要がありますか？", "お申込み時の受検予定人数分のお支払いです。足りなくなった場合は1名から追加でき、余った分の返金はありません。少なめにお申込みいただき、必要に応じて追加する方法もおすすめです。"],
          ["50人以上の事業場でも申し込めますか？", "はい。産業医を選任している事業場は、自社の産業医に面接指導を担当いただくこともできます。なお、50人以上の事業場には産業医の選任義務があります。選任がお済みでない場合はご相談ください。"],
          [`${WEB_MAX_SEATS}名を超える場合は？`, `${WEB_MAX_SEATS}名を超える場合は個別にお見積りします（割引があります）。複数の事業場をまとめたご依頼もご相談ください。`],
          ["翌年度も続けて使えますか？", "はい。2年目以降は、ログイン後の画面から同じ操作でお申し込みいただけます(会社の登録は最初の1回だけ)。更新の時期が近づくと、ご担当者さまにご案内メールをお送りします。従業員の皆さまのアカウントと過去の結果はそのまま引き継がれ、前年度との比較もできます。"],
          ["請求書払いはできますか？", `Web申込のお支払いは${PAYMENT_METHODS_TEXT}です。請求書払いをご希望の場合はお問い合わせください。`],
        ].map(([q, a]) => (
          <div key={q} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: brand.ink }}>Q. {q}</div>
            <div style={{ fontSize: 14, color: "#44534F", lineHeight: 1.8 }}>A. {a}</div>
          </div>
        ))}
      </Card>

      <div style={{ textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
        <Link href="/plan/signup" style={{ background: brand.orange, color: "#fff", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 16, textDecoration: "none" }}>
          会社を登録して申し込む
        </Link>
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
