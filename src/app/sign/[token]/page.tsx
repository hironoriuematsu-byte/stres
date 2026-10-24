import { headers } from "next/headers";
import { Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";
import { adminClient } from "@/lib/plan-server";
import { addEvent, clientIp, loadContractByToken, loadEvents, userAgent } from "@/lib/contract-server";
import { CODE_MAX_ATTEMPTS } from "@/lib/contract";
import { SignView, type PublicContract } from "./SignView";

export const metadata = { title: "契約書の確認・電子署名", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// 契約先の署名者がメールのリンクから開くページ(ログイン不要)。
// 契約書を表示し、署名待ちなら署名(または辞退)の欄を出す。締結後は契約書と合意締結証明を表示する。
// 最初に開いたときだけ「閲覧」の記録を残す
export default async function SignPage({ params }: { params: { token: string } }) {
  const admin = adminClient();
  const invalid = (
    <Card style={{ maxWidth: 560, margin: "0 auto" }}>
      <h2 style={{ fontSize: 18, color: brand.ink, margin: "0 0 8px" }}>このリンクは無効です</h2>
      <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.9, margin: 0 }}>
        契約書の送信が取り消されたか、新しいリンクが送り直された可能性があります。送信者(うえまつ産業医事務所 {SELLER.email})にご確認ください。
      </p>
    </Card>
  );
  if (!admin) return invalid;
  const c = await loadContractByToken(admin, params.token);
  if (!c || !c.document) return invalid;

  if (c.status === "sent" && !c.viewed_at) {
    const h = headers();
    const now = new Date().toISOString();
    const { data: claimed } = await admin.from("contracts").update({ viewed_at: now }).eq("id", c.id).is("viewed_at", null).select("id");
    if (claimed && claimed.length > 0) {
      await addEvent(admin, c.id, { event: "viewed", actor: "party", actor_name: c.signer_name, actor_email: c.signer_email, ip: clientIp(h), user_agent: userAgent(h) });
    }
  }
  const events = await loadEvents(admin, c.id);

  const pub: PublicContract = {
    id: c.id,
    contract_no: c.contract_no,
    status: c.status,
    signer_name: c.signer_name,
    signer_title: c.signer_title,
    signer_email: c.signer_email,
    sent_at: c.sent_at,
    token_expires_at: c.token_expires_at,
    signed_at: c.signed_at,
    signed_name: c.signed_name,
    signed_title: c.signed_title,
    declined_at: c.declined_at,
    document_hash: c.document_hash,
    completion_hash: c.completion_hash,
    service_signature: c.service_signature,
    requiresCode: !!c.access_code_hash,
    codeLocked: c.code_attempts >= CODE_MAX_ATTEMPTS,
  };
  return <SignView token={params.token} contract={pub} doc={c.document} events={events} />;
}
