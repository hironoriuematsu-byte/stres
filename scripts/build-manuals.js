// ============================================================
// マニュアルのPDF生成と、アプリ内で閲覧できるHTMLの配置
//
//   node scripts/build-manuals.js
//
// - docs/manuals/*.html を編集したら、このスクリプトを実行する
// - 各HTMLからA4のPDFを生成して docs/manuals/*.pdf を更新する
// - 実施事務従事者向けの2冊は、アプリ内(/guide/jimu)から閲覧できるよう
//   public/manuals/ にもコピーする(ロゴの参照先だけ書き換える)
// ============================================================

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const ROOT = path.join(__dirname, "..");
const SRC_DIR = path.join(ROOT, "docs", "manuals");
const PUB_DIR = path.join(ROOT, "public", "manuals");

// アプリ内でも配信するマニュアル(docs側のファイル名 → public側のファイル名)
const PUBLISH = {
  "manual-jimu-start": "jimu-start",
  "manual-jimu": "jimu",
};

const MANUALS = ["manual-jimu-start", "manual-jimu", "manual-office", "manual-employee"];

(async () => {
  fs.mkdirSync(PUB_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  });
  const page = await browser.newPage({ viewport: { width: 860, height: 1200 } });

  for (const name of MANUALS) {
    const srcHtml = path.join(SRC_DIR, `${name}.html`);
    if (!fs.existsSync(srcHtml)) continue;

    // PDF(docs側・配布用)
    await page.goto("file://" + srcHtml, { waitUntil: "networkidle" });
    const logoOk = await page.evaluate(() => {
      const i = document.querySelector("img");
      return !!i && i.naturalWidth > 0;
    });
    await page.pdf({
      path: path.join(SRC_DIR, `${name}.pdf`),
      format: "A4",
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "14mm", right: "14mm" },
    });

    // アプリ内配信用(public/manuals)。ロゴの相対パスだけ書き換える
    let published = "";
    if (PUBLISH[name]) {
      const html = fs.readFileSync(srcHtml, "utf8").replace(/\.\.\/\.\.\/public\/logo\.png/g, "/logo.png");
      fs.writeFileSync(path.join(PUB_DIR, `${PUBLISH[name]}.html`), html);
      fs.copyFileSync(path.join(SRC_DIR, `${name}.pdf`), path.join(PUB_DIR, `${PUBLISH[name]}.pdf`));
      published = ` → public/manuals/${PUBLISH[name]}.html`;
    }
    console.log(`${name}: PDF生成${logoOk ? "" : "(⚠ ロゴが読み込めていません)"}${published}`);
  }

  await browser.close();
})();
