import { brand } from "@/lib/brand";
import { IMPLEMENTER, SELLER } from "@/lib/org";
import { type ContractEvent, EVENT_LABEL, formatJst } from "@/lib/contract";

export type CertificateContract = {
  contract_no: string;
  status: string;
  document_hash: string | null;
  completion_hash: string | null;
  service_signature: string | null;
  signed_at: string | null;
};

// 合意締結証明(監査証跡)。契約書の末尾に続けて表示・印刷する。
// 誰が・いつ・どこから(IP)・何をしたかの記録と、文面のハッシュ・記録の連鎖・事業者署名を示す
export function ContractCertificate({ contract, events }: { contract: CertificateContract; events: ContractEvent[] }) {
  const td = { padding: "6px 8px", borderBottom: `1px solid ${brand.line}`, fontSize: 12.5, verticalAlign: "top" as const };
  const th = { ...td, background: "#EEF5F4", fontWeight: 700, textAlign: "left" as const, whiteSpace: "nowrap" as const };
  const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, wordBreak: "break-all" as const };
  const signed = contract.status === "signed";
  return (
    <section className="contract-article" style={{ marginTop: 28, paddingTop: 18, borderTop: `2px solid ${brand.line}` }}>
      <h2 style={{ fontSize: 16, margin: "0 0 4px", color: brand.ink }}>合意締結証明(署名の記録)</h2>
      <p style={{ fontSize: 12.5, color: "#44534F", lineHeight: 1.8, margin: "0 0 12px" }}>
        本契約は、{SELLER.name}({IMPLEMENTER.officeName})が提供する電子契約の機能(事業者署名型)により締結されました。
        各当事者の合意は、メールアドレスに送った署名用リンクによる本人確認{events.some((e) => e.detail && (e.detail as Record<string, unknown>).access_code_used === true) ? "とアクセスコード" : ""}
        のもとで記録され、契約書の文面のハッシュ(SHA-256)と、下記の記録の連鎖のハッシュに、当事務所の電子署名(HMAC-SHA256)を付与しています。
        記録の日時はサーバーの時刻(日本時間)です。
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 14 }}>
        <tbody>
          <tr>
            <th style={{ ...th, width: 140 }}>契約番号</th>
            <td style={td}>{contract.contract_no}</td>
          </tr>
          <tr>
            <th style={th}>締結日時</th>
            <td style={td}>{signed ? formatJst(contract.signed_at) : "(未締結)"}</td>
          </tr>
          <tr>
            <th style={th}>文面のハッシュ</th>
            <td style={{ ...td, ...mono }}>{contract.document_hash ?? "(送信時に確定します)"}</td>
          </tr>
          <tr>
            <th style={th}>記録の連鎖の末尾</th>
            <td style={{ ...td, ...mono }}>{contract.completion_hash ?? "(締結時に確定します)"}</td>
          </tr>
          <tr>
            <th style={th}>事業者署名</th>
            <td style={{ ...td, ...mono }}>{signed ? contract.service_signature ?? "(未設定: サーバーの署名鍵が設定されていません)" : "(締結時に付与します)"}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={th}>#</th>
              <th style={th}>日時</th>
              <th style={th}>事象</th>
              <th style={th}>当事者</th>
              <th style={th}>氏名・メールアドレス</th>
              <th style={th}>IPアドレス</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td style={td}>{e.seq}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}>{formatJst(e.at)}</td>
                <td style={td}>
                  {EVENT_LABEL[e.event] ?? e.event}
                  {e.event === "declined" && e.detail && (e.detail as Record<string, unknown>).reason ? (
                    <div style={{ color: "#5B6B6A" }}>理由: {String((e.detail as Record<string, unknown>).reason)}</div>
                  ) : null}
                </td>
                <td style={td}>{e.actor === "office" ? "乙(事務所)" : e.actor === "party" ? "甲(契約先)" : "システム"}</td>
                <td style={td}>
                  {e.actor_name && <div>{e.actor_name}</div>}
                  {e.actor_email && <div style={{ color: "#5B6B6A" }}>{e.actor_email}</div>}
                </td>
                <td style={{ ...td, ...mono }}>{e.ip ?? ""}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td style={td} colSpan={6}>
                  記録はまだありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11.5, color: "#7A8886", lineHeight: 1.7, margin: "10px 0 0" }}>
        各記録のハッシュは直前の記録のハッシュを含めて計算されているため、途中の記録を改変すると以降のハッシュが一致しなくなります。
        契約書の真正性は、契約番号と文面のハッシュで確認できます(本サイトの「契約書の確認」ページ)。電子契約のため、収入印紙は不要です。
      </p>
    </section>
  );
}
