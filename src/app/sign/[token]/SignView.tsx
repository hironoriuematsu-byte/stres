"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Btn, Card } from "@/components/ui";
import { ContractSheet } from "@/components/ContractSheet";
import { ContractCertificate } from "@/components/ContractCertificate";
import { brand } from "@/lib/brand";
import { SELLER } from "@/lib/org";
import { type ContractDoc, type ContractEvent, displayStatus, formatJst, STATUS_LABEL } from "@/lib/contract";

export type PublicContract = {
  id: string;
  contract_no: string;
  status: string;
  signer_name: string;
  signer_title: string | null;
  signer_email: string;
  sent_at: string | null;
  token_expires_at: string | null;
  signed_at: string | null;
  signed_name: string | null;
  signed_title: string | null;
  declined_at: string | null;
  document_hash: string | null;
  completion_hash: string | null;
  service_signature: string | null;
  requiresCode: boolean;
  codeLocked: boolean;
};

const OFFICE_SIGN = `${SELLER.name} 代表社員 ${SELLER.representative}`;

export function SignView({ token, contract: c, doc, events }: { token: string; contract: PublicContract; doc: ContractDoc; events: ContractEvent[] }) {
  const router = useRouter();
  const st = displayStatus(c.status, c.token_expires_at);
  const [name, setName] = useState(c.signer_name);
  const [title, setTitle] = useState(c.signer_title ?? "");
  const [code, setCode] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");

  const post = async (url: string, body: unknown) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMsg({ ok: false, text: json.error ?? `通信エラー(${res.status})` });
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  };

  const sign = async () => {
    if (!agree) {
      setMsg({ ok: false, text: "契約内容を確認し、同意のチェックを入れてください" });
      return;
    }
    if (!window.confirm("電子署名を行い、この契約を締結します。よろしいですか？(締結後は取り消せません)")) return;
    if (await post("/api/contracts/sign", { token, name, title, agree, accessCode: code })) {
      setMsg({ ok: true, text: "電子署名が完了し、契約が締結されました。控えのメールをお送りしました。" });
      router.refresh();
    }
  };
  const decline = async () => {
    if (!window.confirm("署名を辞退して、送信者に理由を伝えます。よろしいですか？")) return;
    if (await post("/api/contracts/decline", { token, reason })) {
      setMsg({ ok: true, text: "辞退を送信者に伝えました。" });
      router.refresh();
    }
  };

  const sentEvent = events.find((e) => e.event === "sent");
  const otsuSign = sentEvent ? { name: OFFICE_SIGN, at: sentEvent.at } : c.sent_at ? { name: OFFICE_SIGN, at: c.sent_at } : null;
  const koSign = c.status === "signed" && c.signed_at ? { name: c.signed_title ? `${c.signed_name}(${c.signed_title})` : c.signed_name ?? c.signer_name, email: c.signer_email, at: c.signed_at } : null;
  const watermark = c.status === "signed" ? undefined : c.status === "cancelled" ? "取消" : c.status === "declined" ? "辞退" : "未締結";

  const input = { width: "100%", padding: "10px 12px", fontSize: 15, border: `1px solid ${brand.line}`, borderRadius: 9, boxSizing: "border-box" as const };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 16 }}>
      <Card className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Badge tone={STATUS_LABEL[st].tone}>{STATUS_LABEL[st].label}</Badge>
          <h2 style={{ fontSize: 18, color: brand.ink, margin: "8px 0 2px" }}>産業医業務委託契約書(契約番号 {c.contract_no})</h2>
          <div style={{ fontSize: 13, color: "#5B6B6A" }}>
            送信者: うえまつ産業医事務所({SELLER.name}) / 署名者: {c.signer_name} 様({c.signer_email})
          </div>
        </div>
        <button
          onClick={() => window.print()}
          style={{ background: brand.teal, color: "#fff", border: "none", borderRadius: 10, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          印刷 / PDFとして保存
        </button>
      </Card>

      {msg && (
        <Card className="no-print" style={{ borderColor: msg.ok ? brand.teal : "#E0A0A0", background: msg.ok ? "#F2FAF9" : "#FFF6F6" }}>
          <p style={{ margin: 0, fontSize: 14, color: msg.ok ? brand.tealDark : "#B02A2A", lineHeight: 1.8 }}>{msg.text}</p>
        </Card>
      )}

      {st === "sent" && (
        <Card className="no-print" style={{ borderColor: brand.orange }}>
          <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>電子署名のお願い</h3>
          <p style={{ fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "0 0 8px" }}>
            下の契約書の内容をご確認ください。内容に同意いただける場合は、このページの最後にある署名欄で氏名・役職を入力し、「同意して締結する」を押してください。
            署名の期限は {formatJst(c.token_expires_at)} です。修正のご希望がある場合は、署名欄の「辞退する」から理由をお知らせください。
          </p>
          <p style={{ fontSize: 12.5, color: "#7A8886", lineHeight: 1.7, margin: 0 }}>
            ※ 電子契約のため、書面・押印・収入印紙は不要です。締結後は、このリンクから契約書と合意締結証明をいつでも閲覧・印刷できます。
          </p>
        </Card>
      )}
      {st === "expired" && (
        <Card className="no-print" style={{ borderColor: "#E0A0A0" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#B02A2A", lineHeight: 1.8 }}>
            署名の期限({formatJst(c.token_expires_at)})が過ぎています。送信者({SELLER.email})にリンクの再送をご依頼ください。
          </p>
        </Card>
      )}

      <ContractSheet doc={doc} otsuSign={otsuSign} koSign={koSign} watermark={watermark}>
        {st === "sent" && (
          <div className="no-print" style={{ marginTop: 24, border: `2px solid ${brand.orange}`, borderRadius: 12, padding: "18px 20px", background: "#FFF9F4" }}>
            <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 10px" }}>甲(契約先)の電子署名</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#44534F" }}>
                署名者の氏名
                <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...input, marginTop: 4 }} />
              </label>
              <label style={{ fontSize: 13, color: "#44534F" }}>
                役職(任意)
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="代表取締役 / 総務部長 など" style={{ ...input, marginTop: 4 }} />
              </label>
              {c.requiresCode && (
                <label style={{ fontSize: 13, color: "#44534F" }}>
                  アクセスコード(送信者から別途お伝えした数字)
                  <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" style={{ ...input, marginTop: 4 }} disabled={c.codeLocked} />
                </label>
              )}
            </div>
            {c.codeLocked && <p style={{ fontSize: 13, color: "#B02A2A", margin: "0 0 10px" }}>アクセスコードの入力回数の上限に達しています。送信者にリンクの再送をご依頼ください。</p>}
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, color: brand.ink, lineHeight: 1.7, marginBottom: 14 }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 5, width: 18, height: 18 }} />
              <span>
                上記の契約書の内容を確認し、甲を代表して(または甲から権限を与えられた者として)電子署名により本契約を締結することに同意します。
                この操作が、電子署名及び認証業務に関する法律に定める電子署名として記録されることを了承します。
              </span>
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <Btn tone="orange" onClick={sign} disabled={busy || c.codeLocked}>
                {busy ? "処理中…" : "同意して締結する"}
              </Btn>
              {!declining ? (
                <button onClick={() => setDeclining(true)} style={{ background: "none", border: "none", color: "#8A9694", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
                  辞退する(内容の修正を希望する)
                </button>
              ) : null}
            </div>
            {declining && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${brand.line}`, paddingTop: 12 }}>
                <label style={{ fontSize: 13, color: "#44534F" }}>
                  辞退の理由・修正のご希望(送信者に伝わります)
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...input, marginTop: 4, fontFamily: "inherit" }} />
                </label>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <Btn tone="ghost" onClick={decline} disabled={busy}>
                    辞退を送信する
                  </Btn>
                  <Btn tone="ghost" onClick={() => setDeclining(false)} disabled={busy} style={{ borderColor: brand.line, color: "#5B6B6A" }}>
                    やめる
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}
        <ContractCertificate contract={c} events={events} />
      </ContractSheet>
    </div>
  );
}
