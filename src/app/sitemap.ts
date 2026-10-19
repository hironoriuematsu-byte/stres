import type { MetadataRoute } from "next";

const BASE = "https://stres.mestate.jp";

// 検索エンジンに知らせる公開ページの一覧(ログイン後の画面は含めない)
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/plan`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${BASE}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/plan/brochure`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/plan/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/plan/tokushoho`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
