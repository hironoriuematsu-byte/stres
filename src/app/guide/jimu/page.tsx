import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth-server";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

export const metadata = {
  title: "使い方ガイド | ストレスチェックWeb",
};

// 実施事務従事者向けのマニュアルを、ログイン後の画面から読めるようにする
export default async function JimuGuidePage() {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/guide/jimu");

  const backTo = profile?.role === "office" ? "/office" : profile?.role === "jimu" ? "/jimu" : "/my";

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 14 }}>
      <Card>
        <Badge>実施事務従事者向け</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 6px" }}>使い方ガイド</h2>
        <p style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.9, margin: "0 0 14px" }}>
          はじめて運用される方に向けて、準備から集団分析報告書のお渡しまでを順を追ってまとめています。
          社内案内文の例、よくあるお問い合わせと回答、運用チェックリストも収載しています。
          印刷や配布に使える資料も下のボタンから保存できます。
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a href="/manuals/jimu-start.html" target="_blank" rel="noopener noreferrer">
            <Btn>別のタブで開く(印刷・PDF保存)</Btn>
          </a>
          <a href="/manuals/jimu-start.pdf" target="_blank" rel="noopener noreferrer">
            <Btn tone="ghost">PDFを開く</Btn>
          </a>
          <a href="/manuals/jimu.html" target="_blank" rel="noopener noreferrer">
            <Btn tone="ghost">操作マニュアル(別冊)</Btn>
          </a>
          <Link href={backTo}>
            <Btn tone="ghost">ダッシュボードへ戻る</Btn>
          </Link>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <iframe
          src="/manuals/jimu-start.html"
          title="実施事務従事者向け はじめての運用ガイド"
          style={{ width: "100%", height: "78vh", minHeight: 520, border: "none", display: "block" }}
        />
      </Card>

      <Card>
        <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.9, margin: 0 }}>
          ご不明な点は、うえまつ産業医事務所(
          <a href="mailto:support@mestate.jp" style={{ color: brand.tealDark, fontWeight: 700 }}>
            support@mestate.jp
          </a>
          )までお気軽にお問い合わせください。
        </p>
      </Card>
    </div>
  );
}
