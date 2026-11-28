import { headers } from "next/headers";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";
import { adminClient } from "@/lib/plan-server";
import { addEvent, clientIp, loadContractByReviewToken, userAgent } from "@/lib/contract-server";
import { parseContractFields, renderContract } from "@/lib/contract";
import { ReviewView } from "./ReviewView";

export const metadata = { title: "契約書の案文の確認", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// 確認用リンク(署名なし)。相手がログインなしで最新の下書きを読み、問題なし / 修正希望を返せる。
// 下書きの間だけ有効。署名用リンクを送ると無効になる。最初に開いたときだけ「閲覧」の記録を残す
export default async function ReviewPage({ params }: { params: { token: string } }) {
  const admin = adminClient();
  const invalid = (
    <Card style={{ maxWidth: 560, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 8px" }}>このリンクは使えません</h2>
      <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.9, margin: 0 }}>
        案文が電子署名用のリンクに進んだか、取り下げられた可能性があります。電子署名用のリンクはメールでお届けしています。
        ご不明な点は送信者(うえまつ産業医事務所 {SELLER.email})にご確認ください。
      </p>
    </Card>
  );
  if (!admin) return invalid;
  const c = await loadContractByReviewToken(admin, params.token);
  if (!c || c.status !== "draft") return invalid;
  const parsed = parseContractFields(c.fields as unknown as Record<string, unknown>);
  if (!parsed.ok) return invalid;

  if (!c.review_viewed_at) {
    const h = headers();
    const { data: claimed } = await admin.from("contracts").update({ review_viewed_at: new Date().toISOString() }).eq("id", c.id).is("review_viewed_at", null).select("id");
    if (claimed && claimed.length > 0) {
      await addEvent(admin, c.id, { event: "review_viewed", actor: "party", actor_name: c.signer_name, actor_email: c.signer_email, ip: clientIp(h), user_agent: userAgent(h) });
    }
  }

  // 常に最新の下書きの内容から作る(文面はまだ確定していない)
  const doc = renderContract(parsed.value, { contractNo: c.contract_no });
  return (
    <ReviewView
      token={params.token}
      doc={doc}
      signerName={c.signer_name}
      updatedAt={c.updated_at}
      feedback={c.review_feedback_kind ? { kind: c.review_feedback_kind, at: c.review_feedback_at ?? null, comment: c.review_feedback ?? null } : null}
    />
  );
}
