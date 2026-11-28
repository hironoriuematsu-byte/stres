import type { ReactNode } from "react";
import { brand } from "@/lib/brand";
import { type ContractDoc, type ContractItem, type ContractParty, formatJst } from "@/lib/contract";

export type SignStamp = {
  name: string; // 署名者の氏名(役職を含む)
  email?: string | null;
  at: string; // 署名日時(ISO)
};

// 契約書本体。画面での表示と印刷(PDF保存)の両方に使う。
// 署名欄には、電子署名の状況(署名済み: 氏名・日時 / 未署名)を表示する
export function ContractSheet({
  doc,
  otsuSign,
  koSign,
  watermark,
  children,
}: {
  doc: ContractDoc;
  otsuSign: SignStamp | null; // 乙(事務所)の電子署名。送信時に付く
  koSign: SignStamp | null; // 甲(契約先)の電子署名
  watermark?: string; // 「下書き」「取消」など(締結前の表示)
  children?: ReactNode; // 署名欄の下に置くもの(合意締結証明など)
}) {
  return (
    <div className="contract-sheet" style={{ background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 12, padding: "36px 40px", color: "#1F2D2B", position: "relative" }}>
      <style>{`
        @media print {
          header, footer, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: #fff !important; }
          .contract-sheet { border: none !important; box-shadow: none !important; padding: 0 !important; }
          .contract-article { break-inside: avoid; }
        }
        @page { size: A4; margin: 18mm; }
        @media (max-width: 560px) { .contract-sheet { padding: 20px 16px !important; } .contract-parties { grid-template-columns: 1fr !important; } }
      `}</style>
      {watermark && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            fontSize: 13,
            fontWeight: 800,
            color: "#B02A2A",
            border: "2px solid #B02A2A",
            borderRadius: 6,
            padding: "2px 10px",
            letterSpacing: "0.2em",
          }}
        >
          {watermark}
        </div>
      )}
      <h1 style={{ textAlign: "center", fontSize: 24, letterSpacing: "0.3em", margin: "0 0 6px", paddingLeft: "0.3em" }}>{doc.title}</h1>
      <div style={{ textAlign: "right", fontSize: 12, color: "#5B6B6A", marginBottom: 20 }}>契約番号 {doc.contractNo}</div>

      <p style={{ fontSize: 14.5, lineHeight: 1.95, margin: "0 0 18px" }}>{doc.preamble}</p>

      {doc.articles.map((a) => (
        <section key={a.no} className="contract-article" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: brand.ink }}>
            第{a.no}条({a.title})
          </h2>
          {a.items.length === 1 ? (
            <Item it={a.items[0]} />
          ) : (
            <ol style={{ margin: 0, paddingLeft: 26, fontSize: 14.5, lineHeight: 1.95 }}>
              {a.items.map((it, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  <Item it={it} inline />
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}

      <p style={{ fontSize: 14.5, lineHeight: 1.95, margin: "22px 0 18px" }}>{doc.closing}</p>

      <div className="contract-parties" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <PartyBlock p={doc.ko} sign={koSign} role="契約先" />
        <PartyBlock p={doc.otsu} sign={otsuSign} role="産業医事務所" />
      </div>

      {children}
    </div>
  );
}

function Item({ it, inline = false }: { it: ContractItem; inline?: boolean }) {
  const text = typeof it === "string" ? it : it.text;
  const subs = typeof it === "string" ? [] : it.subs;
  const style = { fontSize: 14.5, lineHeight: 1.95, margin: 0, whiteSpace: "pre-wrap" as const };
  return (
    <>
      {inline ? <span style={style}>{text}</span> : <p style={style}>{text}</p>}
      {subs.length > 0 && (
        <ol style={{ margin: "2px 0 4px", paddingLeft: 30, fontSize: 14, lineHeight: 1.9, listStyle: "none" }}>
          {subs.map((s, k) => (
            <li key={k} style={{ textIndent: "-1.8em", paddingLeft: "1.8em" }}>
              ({k + 1}) {s}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function PartyBlock({ p, sign, role }: { p: ContractParty; sign: SignStamp | null; role: string }) {
  return (
    <div style={{ border: `1px solid ${brand.line}`, borderRadius: 10, padding: "14px 16px", fontSize: 14, lineHeight: 1.8 }}>
      <div style={{ fontSize: 12, color: "#7A8886", marginBottom: 2 }}>
        {p.label}({role})
      </div>
      <div>{p.address}</div>
      <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
      <div>{p.rep}</div>
      {p.note && <div style={{ fontSize: 13, color: "#44534F" }}>{p.note}</div>}
      <div style={{ marginTop: 10 }}>
        {sign ? (
          <div
            style={{
              display: "inline-block",
              border: `2px solid ${brand.tealDark}`,
              borderRadius: 8,
              padding: "6px 12px",
              color: brand.tealDark,
              fontSize: 12.5,
              lineHeight: 1.6,
              background: "#F2FAF9",
            }}
          >
            <div style={{ fontWeight: 800, letterSpacing: "0.1em" }}>電子署名済</div>
            <div>{sign.name}</div>
            {sign.email && <div>{sign.email}</div>}
            <div>{formatJst(sign.at)}</div>
          </div>
        ) : (
          <div style={{ display: "inline-block", border: "2px dashed #B9C9C6", borderRadius: 8, padding: "6px 12px", color: "#8A9694", fontSize: 12.5 }}>電子署名: 未署名</div>
        )}
      </div>
    </div>
  );
}
