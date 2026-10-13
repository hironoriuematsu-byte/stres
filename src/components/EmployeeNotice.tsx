"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { Btn } from "@/components/ui";
import { brand } from "@/lib/brand";
import { IMPLEMENTER } from "@/lib/org";
import { formatJpDate } from "@/lib/plan";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// 従業員の皆さまへの「ストレスチェック実施のお知らせ」。受検用URLとQRコードを入れた文面を、
// そのままメール・社内チャット・文書に貼り付けたり、印刷・PDFにして掲示したりできる
export function EmployeeNotice({
  companyId,
  fiscalYear,
  examStart,
  examEnd,
  questionnaire,
  previewUrl,
}: {
  companyId: string;
  fiscalYear: number;
  examStart: string;
  examEnd: string;
  questionnaire: string;
  previewUrl?: string; // 紹介用(デモ): データベースを読まずにこのURLを使う
}) {
  const [url, setUrl] = useState<string | null>(previewUrl ?? null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (previewUrl) return;
    createClient()
      .rpc("get_campaign", { p_company: companyId, p_year: fiscalYear })
      .maybeSingle()
      .then(({ data }) => {
        const c = data as { token: string; active: boolean } | null;
        setUrl(c?.active ? `${window.location.origin}/join/${c.token}` : null);
      });
  }, [companyId, fiscalYear, previewUrl]);

  useEffect(() => {
    if (!url) return setQr(null);
    QRCode.toDataURL(url, { width: 300, margin: 2 }).then(setQr).catch(() => setQr(null));
  }, [url]);

  const minutes = questionnaire === "80" ? "約15分" : "約10分";
  const urlLine = url ?? "(受検用URLは「配布URL・QR」でご確認ください)";
  const before = `ストレスチェック実施のお知らせ

労働安全衛生法に基づき、ストレスチェックを実施します。ご自身のストレスの状態に気づき、職場環境の改善につなげることが目的です。

■ 受検期間: ${formatJpDate(examStart)} 〜 ${formatJpDate(examEnd)}
■ 受検方法: 下の受検用URLまたはQRコードから、スマートフォンまたはパソコンで回答してください(${minutes})。
   初めての方は、メールアドレスとパスワードを登録してから受検します。昨年度に受検した方は、同じアカウントでログインしてください。
■ 受検用URL: ${urlLine}`;
  const after = `■ 実施者: ${IMPLEMENTER.full}(${IMPLEMENTER.officeName})
■ 結果の取扱い:
 ・結果は受検後すぐにご本人に表示されます。
 ・個人の結果は、実施者と実施事務従事者(守秘義務があり、人事権のない担当者)が取り扱い、ご本人の同意がない限り会社に提供されません。
 ・高ストレスと判定された方は、医師による面接指導を申し出ることができます。
 ・受検しないこと、結果、面接指導の申出を理由に、不利益な取扱いをすることはありません。
 ・部署ごとの集計(10名未満の集団は除く)を職場環境の改善に活用します。個人が特定されることはありません。
 ・結果は実施者のもとで5年間保存されます。

ご不明な点は、ストレスチェック担当者までお問い合わせください。`;
  const plain = `${before}\n\n${after}`;

  const toHtml = (t: string) => escapeHtml(t).replace(/\n/g, "<br>");
  const qrHtml = qr
    ? `<p><img src="${qr}" alt="受検用QRコード" width="180" height="180"><br><span style="font-size:12px;color:#555;">受検用QRコード(スマートフォンのカメラで読み取れます)</span></p>`
    : "";
  const html = `<div style="font-family:'Meiryo','Hiragino Sans','Yu Gothic',sans-serif;font-size:14px;line-height:1.8;color:#22333B;">${toHtml(before)}${qrHtml}${toHtml(after)}</div>`;

  const flash = (k: string) => {
    setCopied(k);
    setTimeout(() => setCopied(null), 2500);
  };

  // QRコード付きでコピー(Word・Outlook などには画像ごと貼り付けられる。文字だけの貼り付け先にはURL入りの文面が入る)
  const copyWithQr = async () => {
    try {
      if (typeof ClipboardItem === "undefined") throw new Error("no ClipboardItem");
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(plain);
    }
    flash("qr");
  };
  const copyText = async () => {
    await navigator.clipboard.writeText(plain);
    flash("text");
  };
  // 掲示用: QRコードを大きく入れて印刷・PDF保存
  const printNotice = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>ストレスチェック実施のお知らせ</title>
<style>@page{size:A4;margin:18mm}body{font-family:'Meiryo','Hiragino Sans','Yu Gothic',sans-serif;color:#22333B;font-size:13.5px;line-height:1.85}
h1{font-size:22px;margin:0 0 14px}.qr{display:flex;gap:16px;align-items:center;border:1px solid #ccc;border-radius:10px;padding:12px;margin:14px 0}</style></head><body>
<h1>ストレスチェック実施のお知らせ</h1>
<div>${toHtml(before.replace(/^ストレスチェック実施のお知らせ\n\n/, ""))}</div>
${qr ? `<div class="qr"><img src="${qr}" width="200" height="200" alt="受検用QRコード"><div>スマートフォンのカメラでQRコードを読み取ると、受検の画面が開きます。</div></div>` : ""}
<div>${toHtml(after)}</div>
<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Btn onClick={copyWithQr} disabled={!url} style={{ padding: "7px 14px", fontSize: 13 }}>
          {copied === "qr" ? "コピーしました ✓" : "QRコード付きでコピー"}
        </Btn>
        <Btn tone="ghost" onClick={copyText} style={{ padding: "7px 14px", fontSize: 13 }}>
          {copied === "text" ? "コピーしました ✓" : "文面だけコピー(URL入り)"}
        </Btn>
        <Btn tone="ghost" onClick={printNotice} disabled={!url} style={{ padding: "7px 14px", fontSize: 13 }}>
          掲示用に印刷・PDF保存
        </Btn>
      </div>
      <div style={{ fontSize: 12, color: "#5B6B6A", lineHeight: 1.7, marginBottom: 8 }}>
        「QRコード付きでコピー」は、Outlook・Word などにはQRコードの画像ごと貼り付けられます。画像が入らない貼り付け先(一部のメール・チャット)では、URL入りの文面が入ります。
      </div>
      <div
        style={{
          fontSize: 13,
          color: "#44534F",
          lineHeight: 1.8,
          background: "#F4FAF9",
          border: `1px solid ${brand.line}`,
          borderRadius: 10,
          padding: "12px 14px",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {before}
        {qr && (
          <div style={{ margin: "8px 0" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="受検用QRコード" width={140} height={140} style={{ border: `1px solid ${brand.line}`, borderRadius: 6, background: "#fff" }} />
          </div>
        )}
        {!qr && "\n\n"}
        {after}
      </div>
    </div>
  );
}
