import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
import { brand } from "@/lib/brand";
import { JoinForm } from "./JoinForm";

export default async function JoinPage({ params }: { params: { token: string } }) {
  const supabase = createClient();
  const { data } = await supabase.rpc("campaign_info", { p_token: params.token });
  const info = Array.isArray(data) ? data[0] : null;

  if (!info || !info.active) {
    return (
      <Card style={{ maxWidth: 520, margin: "0 auto" }}>
        <h2 style={{ fontSize: 19, color: brand.ink, margin: "0 0 8px" }}>
          このURLは無効か、配布が終了しています
        </h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, margin: 0 }}>
          URLに誤りがないかご確認のうえ、会社のストレスチェック担当者(実施事務従事者)にお問い合わせください。
        </p>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 14 }}>
      <Card>
        <Badge>ストレスチェックのご案内</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 6px" }}>
          {info.company_name} {info.fiscal_year}年度 ストレスチェック
        </h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.9, margin: 0 }}>
          厚生労働省「職業性ストレス簡易調査票(57項目)」によるストレスチェックです。受検にはアカウント登録(本人確認のためのメール認証)が必要です。メールアドレスは会社のものでも個人のものでも構いません。結果はあなた本人と実施者(産業医事務所)・実施事務従事者のみが確認でき、あなたの同意なく会社側へ個人結果が提供されることはありません。
        </p>
      </Card>
      <JoinForm token={params.token} />
    </div>
  );
}
