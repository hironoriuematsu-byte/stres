import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { ContractSheet } from "@/components/ContractSheet";
import { ContractCertificate } from "@/components/ContractCertificate";
import { PrintButton } from "@/components/PrintButton";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";
import { type ContractEvent, type ContractRow, CONTRACT_COLS, displayStatus, formatJst, renderContract, STATUS_LABEL } from "@/lib/contract";

export const metadata = { title: "契約書" };
export const dynamic = "force-dynamic";

// ログインして見る契約書(実施者: すべて / 実施事務従事者: 自社の送信済み・締結済み)。
// 読み取りはログイン利用者の権限(RLS)で行うので、見られない契約は「見つかりません」になる
export default async function ContractPage({ params }: { params: { id: string } }) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=/contracts/${params.id}`);

  const supabase = createClient();
  const { data } = await supabase.from("contracts").select(CONTRACT_COLS).eq("id", params.id).maybeSingle();
  const c = data as ContractRow | null;
  if (!c) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <p style={{ fontSize: 14, margin: 0 }}>契約書が見つかりません(閲覧の権限がない可能性があります)。</p>
      </Card>
    );
  }
  const { data: ev } = await supabase.from("contract_events").select("*").eq("contract_id", c.id).order("seq");
  const events = (ev as ContractEvent[]) ?? [];

  // 下書きは送信時の文面がまだ無いので、今の内容から作って表示する
  const doc = c.document ?? renderContract(c.fields, { contractNo: c.contract_no });
  const st = displayStatus(c.status, c.token_expires_at);
  const officeSign = `${SELLER.name} 代表社員 ${SELLER.representative}`;
  const sentEvent = events.find((e) => e.event === "sent");
  const otsuSign = sentEvent ? { name: officeSign, at: sentEvent.at } : c.sent_at ? { name: officeSign, at: c.sent_at } : null;
  const koSign = c.status === "signed" && c.signed_at ? { name: c.signed_title ? `${c.signed_name}(${c.signed_title})` : c.signed_name ?? c.signer_name, email: c.signer_email, at: c.signed_at } : null;
  const watermark = c.status === "signed" ? undefined : c.status === "draft" ? "下書き" : c.status === "cancelled" ? "取消" : c.status === "declined" ? "辞退" : "未締結";
  const back = profile?.role === "office" ? "/office" : "/jimu";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Badge tone={STATUS_LABEL[st].tone}>{STATUS_LABEL[st].label}</Badge>
          <h2 style={{ fontSize: 18, color: brand.ink, margin: "8px 0 2px" }}>
            {c.party_name} 産業医業務委託契約書(契約番号 {c.contract_no})
          </h2>
          <div style={{ fontSize: 13, color: "#5B6B6A" }}>
            署名者: {c.signer_name}({c.signer_email})
            {c.sent_at ? ` / 送信 ${formatJst(c.sent_at)}` : ""}
            {c.signed_at ? ` / 締結 ${formatJst(c.signed_at)}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href={back} style={{ fontSize: 13, color: brand.tealDark }}>
            ← ダッシュボード
          </Link>
          <PrintButton />
        </div>
      </Card>
      <ContractSheet doc={doc} otsuSign={otsuSign} koSign={koSign} watermark={watermark}>
        <ContractCertificate contract={c} events={events} />
      </ContractSheet>
    </div>
  );
}
