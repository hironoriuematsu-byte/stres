import Link from "next/link";
import { paperCount, paperSections, type PaperItem, type PaperSection } from "@/lib/paper";
import { PrintButton } from "@/components/PrintButton";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";

// 紙で回答する方のための専用の回答用紙(A4)と、結果を受け取ったあとに書く同意書。
//   1枚目: 表紙(氏名・生年月日・部署・性別・記入のしかた)。回答のページには氏名を書かない
//          (写真からのAI読み取りに氏名が写らないようにするため。整理番号でつなぐ)
//   2枚目〜: 回答(設問の通し番号と 1〜4 の番号。あてはまる番号を○で囲む)

type Block = { kind: "head"; sec: PaperSection; cont: boolean } | { kind: "group"; label: string } | { kind: "row"; item: PaperItem };

// 1ページに収める高さ(mm)の目安で、設問をページに分ける
const PAGE_BUDGET = 258;
const CHARS_PER_LINE = 27;
const rowH = (text: string) => (text.length > CHARS_PER_LINE * 2 ? 15.4 : text.length > CHARS_PER_LINE ? 11.2 : 7);
const HEAD_H = 17;
const GROUP_H = 7;

function paginate(sections: PaperSection[]): Block[][] {
  const pages: Block[][] = [];
  let cur: Block[] = [];
  let used = 0;
  const flush = () => {
    if (cur.length) pages.push(cur);
    cur = [];
    used = 0;
  };
  for (const sec of sections) {
    // 見出しのあとに少なくとも3問(設問が少ない領域は全部)は続けて入るようにする
    if (used + HEAD_H + Math.min(3, sec.items.length) * 7 > PAGE_BUDGET) flush();
    cur.push({ kind: "head", sec, cont: false });
    used += HEAD_H;
    let group: string | undefined;
    for (const item of sec.items) {
      const needGroup = item.group && item.group !== group;
      const h = rowH(item.text) + (needGroup ? GROUP_H : 0);
      if (used + h > PAGE_BUDGET) {
        flush();
        cur.push({ kind: "head", sec, cont: true });
        used += HEAD_H;
      }
      if (needGroup) cur.push({ kind: "group", label: item.group! });
      group = item.group;
      cur.push({ kind: "row", item });
      used += h;
    }
  }
  flush();
  return pages;
}

const CSS = `
.ps-page { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 11mm 14mm 10mm; background: #fff; color: #111; margin: 0 auto 16px; box-shadow: 0 1px 6px rgba(0,0,0,.18); font-family: 'Meiryo','Hiragino Sans','Yu Gothic',sans-serif; position: relative; }
.ps-top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 2mm; margin-bottom: 2mm; }
.ps-title { font-size: 13pt; font-weight: 700; }
.ps-sub { font-size: 8.5pt; color: #333; }
.ps-no { font-size: 9pt; display: flex; align-items: center; gap: 2mm; }
.ps-nobox { border: 1px solid #111; min-width: 34mm; height: 8mm; display: inline-flex; align-items: center; justify-content: center; font-size: 12pt; font-weight: 700; letter-spacing: .08em; }
.ps-how { font-size: 9pt; margin: 0 0 1.5mm; }
.ps-head { display: flex; align-items: flex-end; margin-top: 2.5mm; border-bottom: 1.5px solid #111; height: 14.5mm; box-sizing: border-box; }
.ps-head-title { flex: 1; font-size: 11pt; font-weight: 700; padding-bottom: 1.2mm; line-height: 1.25; }
.ps-head-title small { display: block; font-size: 8pt; font-weight: 400; }
.ps-opt { width: 17mm; text-align: center; font-size: 7.4pt; line-height: 1.2; padding-bottom: 1mm; }
.ps-opt b { display: block; font-size: 9pt; }
.ps-group { height: 7mm; box-sizing: border-box; display: flex; align-items: flex-end; font-size: 9pt; font-weight: 700; padding: 0 0 .8mm 1mm; border-bottom: 1px solid #999; }
.ps-row { display: flex; align-items: center; border-bottom: 1px solid #999; box-sizing: border-box; }
.ps-row:nth-of-type(even) { background: #f3f3f3; }
.ps-qno { width: 9mm; text-align: right; padding-right: 2mm; font-size: 10.5pt; font-weight: 700; box-sizing: border-box; }
.ps-qtext { flex: 1; font-size: 10.5pt; line-height: 4.2mm; padding: 0 1mm; }
.ps-choice { width: 17mm; text-align: center; font-size: 13pt; border-left: 1px dotted #999; box-sizing: border-box; align-self: stretch; display: flex; align-items: center; justify-content: center; }
.ps-foot { position: absolute; left: 14mm; right: 14mm; bottom: 6mm; font-size: 8pt; color: #333; display: flex; justify-content: space-between; }
.ps-field { display: flex; align-items: center; border: 1px solid #111; border-top: 0; min-height: 13mm; }
.ps-field:first-of-type { border-top: 1px solid #111; }
.ps-field > span { width: 34mm; background: #eee; align-self: stretch; display: flex; align-items: center; padding-left: 3mm; font-size: 10.5pt; font-weight: 700; border-right: 1px solid #111; box-sizing: border-box; }
.ps-field > div { flex: 1; padding: 0 4mm; font-size: 13pt; }
.ps-box { border: 1px solid #111; border-radius: 2mm; padding: 4mm 5mm; margin-top: 5mm; font-size: 10.5pt; line-height: 1.75; }
.ps-box h3 { font-size: 11.5pt; margin: 0 0 1.5mm; }
.ps-box ul, .ps-box ol { margin: 0; padding-left: 5.5mm; }
@media screen and (max-width: 840px) { .ps-wrap { overflow-x: auto; } }
@media print {
  header, footer, .no-print { display: none !important; }
  body { background: #fff !important; }
  main { padding: 0 !important; }
  .ps-page { margin: 0; box-shadow: none; height: 297mm; min-height: 0; overflow: hidden; break-after: page; page-break-after: always; }
  .ps-page:last-child { break-after: auto; page-break-after: auto; }
}
@page { size: A4; margin: 0; }
`;

export function PaperSheet({
  company,
  questionnaire,
  fy,
  name,
  dept,
  loginId,
  birthLabel,
  back,
  isConsent,
}: {
  company: { name: string };
  questionnaire: "57" | "80";
  fy: number;
  name: string;
  dept: string;
  loginId: string; // 整理番号(メールのない方のログインID。なければ空欄)
  birthLabel: string;
  back: string;
  isConsent: boolean;
}) {
  const toolbar = (
    <Card style={{ maxWidth: 794, margin: "0 auto 14px" }}>
      <div className="no-print" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.7, flex: "1 1 320px" }}>
          <strong style={{ color: brand.ink, fontSize: 15 }}>
            {isConsent ? "結果の提供についての同意書" : `紙の回答用紙(${paperCount(questionnaire)}問)`}
            {name && ` — ${name}さん用`}
          </strong>
          <br />
          {isConsent
            ? "結果票と一緒にご本人に渡してください。結果を見たうえで同意する方だけが記入します。"
            : "A4・白黒で印刷できます。必要な人数分を印刷し、表紙と回答のページをホチキスでとめて、封筒と一緒に渡してください。"}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href={back} style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
            ダッシュボードへ
          </Link>
          <PrintButton label="印刷する" />
        </div>
      </div>
    </Card>
  );

  if (isConsent) {
    return (
      <div className="ps-wrap">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="no-print">{toolbar}</div>
        <div className="ps-page">
          <div className="ps-top">
            <div>
              <div className="ps-title">ストレスチェック結果の提供についての同意書</div>
              <div className="ps-sub">
                {company.name} {fy}年度
              </div>
            </div>
          </div>
          <div className="ps-box" style={{ marginTop: 6 + "mm" }}>
            <h3>この用紙について</h3>
            <ul>
              <li>あなたのストレスチェックの結果(個人の結果)は、あなたの同意がない限り、会社には伝わりません(労働安全衛生法第66条の10)。</li>
              <li>
                <strong>結果票を受け取り、内容を確かめたうえで</strong>、会社(事業者)の担当者に結果を伝えてよいと思う方だけ、この用紙に記入して、封筒に入れて実施事務従事者に渡してください。
              </li>
              <li>同意は任意です。同意しなくても、不利益な扱いを受けることはありません。この用紙を出さなければ「同意しない」として扱います。</li>
              <li>同意したあとで取り消すこともできます。取り消したいときは、実施事務従事者に申し出てください。</li>
            </ul>
          </div>
          <div style={{ marginTop: "10mm", fontSize: "12pt", lineHeight: 2.2 }}>
            <div style={{ display: "flex", gap: "4mm", alignItems: "flex-start" }}>
              <span style={{ display: "inline-block", width: "7mm", height: "7mm", border: "1.5px solid #111", marginTop: "2.5mm", flexShrink: 0 }} />
              <span>
                私は、自分のストレスチェックの結果を確かめました。その結果(個人の結果)を、会社の担当者に提供することに<strong>同意します</strong>。
              </span>
            </div>
          </div>
          <div style={{ marginTop: "10mm" }}>
            <div className="ps-field">
              <span>記入した日</span>
              <div>　　　　　年　　　　月　　　　日</div>
            </div>
            <div className="ps-field">
              <span>部署</span>
              <div>{dept}</div>
            </div>
            <div className="ps-field" style={{ minHeight: "17mm" }}>
              <span>氏名(自分で書く)</span>
              <div />
            </div>
          </div>
          <div className="ps-foot">
            <span>実施事務従事者の方へ: 受け取ったら、画面で「同意を記録」を押し、この用紙は結果と同じく5年間保管してください。</span>
          </div>
        </div>
      </div>
    );
  }

  const pages = paginate(paperSections(questionnaire));
  const total = pages.length;
  const noBox = <span className="ps-nobox">{loginId}</span>;

  return (
    <div className="ps-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="no-print">{toolbar}</div>

      {/* 表紙 */}
      <div className="ps-page">
        <div className="ps-top">
          <div>
            <div className="ps-title" style={{ fontSize: "16pt" }}>ストレスチェック 回答用紙(表紙)</div>
            <div className="ps-sub" style={{ fontSize: "10pt" }}>
              {company.name} {fy}年度
            </div>
          </div>
          <div className="ps-no">整理番号 {noBox}</div>
        </div>
        <div style={{ marginTop: "5mm" }}>
          <div className="ps-field">
            <span>氏名</span>
            <div>{name}</div>
          </div>
          <div className="ps-field">
            <span>生年月日</span>
            <div>{birthLabel || "(西暦)　　　　　　年　　　　月　　　　日"}</div>
          </div>
          <div className="ps-field">
            <span>部署</span>
            <div>{dept}</div>
          </div>
          <div className="ps-field">
            <span>性別</span>
            <div>
              男 　・　 女 <span style={{ fontSize: "9pt" }}>　(どちらかを○で囲む。結果の評価の基準に使います)</span>
            </div>
          </div>
        </div>

        <div className="ps-box">
          <h3>記入のしかた</h3>
          <ol>
            <li>
              次のページからの設問(全部で{paperCount(questionnaire)}問)を読み、<strong>あてはまる番号を1つ、○で囲んでください</strong>。
              <span style={{ display: "inline-flex", gap: "5mm", marginLeft: "4mm", fontSize: "13pt", verticalAlign: "middle" }}>
                (例)
                <span>1</span>
                <span style={{ border: "1.6px solid #111", borderRadius: "50%", width: "7mm", height: "7mm", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>2</span>
                <span>3</span>
                <span>4</span>
              </span>
            </li>
            <li>黒のボールペンか濃い鉛筆で、はっきり書いてください。書き直すときは、まちがえた○に×を付けて、正しい番号を○で囲んでください。</li>
            <li>すべての設問に答えてください(答えていない設問があると、結果を出せません)。深く考えこまず、最近の状態に近いものを選んでください。</li>
            <li>書き終えたら、この表紙と一緒に<strong>封筒に入れて封をして</strong>、実施事務従事者(ストレスチェックの担当者)に渡してください。</li>
          </ol>
        </div>

        <div className="ps-box">
          <h3>結果の取り扱い</h3>
          <ul>
            <li>回答と結果を見るのは、あなた本人・実施者(産業医)・実施事務従事者だけです。実施事務従事者は、人事の権限を持たない担当者で、秘密を守る義務があります。</li>
            <li>
              <strong>あなたの同意がない限り、個人の結果が会社に伝わることはありません</strong>(労働安全衛生法第66条の10)。同意するかどうかは、結果を受け取ったあとに、別の用紙でおたずねします。
            </li>
            <li>回答は実施事務従事者がシステムに登録し、結果票を封筒に入れてお渡しします。個人が特定されない形での職場ごとの集計(10名以上)には使われます。</li>
            <li>高ストレスと判定された方は、産業医の面接指導を申し出ることができます(結果票に案内があります)。</li>
          </ul>
        </div>

        <div style={{ marginTop: "6mm", fontSize: "10.5pt" }}>
          提出の期限: 　　　　月　　　　日 まで　　　／　　提出先: 　　　　　　　　　　　　　　　　
        </div>
        <div className="ps-foot">
          <span>うえまつ産業医事務所 ストレスチェックWeb　職業性ストレス簡易調査票({questionnaire === "80" ? "80" : "57"}項目)</span>
          <span>表紙</span>
        </div>
      </div>

      {/* 回答のページ(氏名は書かない) */}
      {pages.map((blocks, pi) => (
        <div className="ps-page" key={pi}>
          <div className="ps-top">
            <div>
              <div className="ps-title">
                ストレスチェック 回答用紙 {pi + 1} / {total}
              </div>
              <div className="ps-sub">
                {company.name} {fy}年度　　あてはまる番号を1つ、○で囲んでください
              </div>
            </div>
            <div className="ps-no">整理番号 {noBox}</div>
          </div>
          {blocks.map((b, bi) =>
            b.kind === "head" ? (
              <div className="ps-head" key={bi}>
                <div className="ps-head-title">
                  {b.sec.title}
                  {b.cont && "(つづき)"}
                  <small>最もあてはまるものを選んでください。</small>
                </div>
                {b.sec.options.map((o, oi) => (
                  <div className="ps-opt" key={oi}>
                    <b>{oi + 1}</b>
                    {o}
                  </div>
                ))}
              </div>
            ) : b.kind === "group" ? (
              <div className="ps-group" key={bi}>
                {b.label}
              </div>
            ) : (
              <div className="ps-row" key={bi} style={{ minHeight: `${rowH(b.item.text)}mm` }}>
                <div className="ps-qno">{b.item.no}</div>
                <div className="ps-qtext">{b.item.text}</div>
                {[1, 2, 3, 4].map((n) => (
                  <div className="ps-choice" key={n}>
                    {n}
                  </div>
                ))}
              </div>
            )
          )}
          <div className="ps-foot">
            <span>このページには氏名を書かないでください。</span>
            <span>
              {pi + 1} / {total}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
