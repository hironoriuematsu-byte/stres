import type { MetadataRoute } from "next";

// 検索エンジン・AIのクローラー向けの設定。
// 公開してよい案内ページ(料金・申込案内・デモ・規約類)だけを許可し、
// ログイン後の画面や申込手続きの途中の画面は対象外にする。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/plan$",
          "/plan/brochure",
          "/plan/terms",
          "/plan/tokushoho",
          "/plan/*.jpg$",
          "/demo",
          "/privacy",
          // サイトマップ本体と、ページの表示に使う画像・CSS・JS(検索エンジンが画面を正しく描画できるように)
          "/sitemap.xml",
          "/_next/static/",
          "/_next/image",
          "/logo.png",
        ],
        disallow: ["/"],
      },
    ],
    sitemap: "https://stres.mestate.jp/sitemap.xml",
  };
}
