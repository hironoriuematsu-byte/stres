"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { CompanySelect } from "@/components/CompanySelect";
import { ContractSheet } from "@/components/ContractSheet";
import { brand } from "@/lib/brand";
import { postJson } from "@/lib/api-client";
import { formatJpDate } from "@/lib/plan";
import type { Company } from "@/lib/types";
import {
  type ContractFields,
  type ContractRow,
  DEFAULT_FIELDS,
  displayStatus,
  formatJst,
  parseContractFields,
  PAYMENT_OPTIONS,
  renderContract,
  SIGN_LINK_DAYS,
  STATUS_LABEL,
  VISIT_OPTIONS,
} from "@/lib/contract";

type Row = Omit<ContractRow, "document" | "template_version" | "completion_hash" | "service_signature" | "document_hash" | "signed_name" | "signed_title">;

const COLS =
  "id, contract_no, status, company_id, fields, party_name, signer_name, signer_email, signer_title, monthly_fee, start_date, token_expires_at, sent_at, viewed_at, signed_at, declined_at, decline_reason, cancelled_at, note, created_at, updated_at";

// フォームの入力(数値も文字列のまま持ち、保存時に parseContractFields で確認する)
type Form = { [K in keyof ContractFields]: ContractFields[K] extends boolean ? boolean : string };
const toForm = (f: ContractFields): Form => ({
  ...f,
  workers: f.workers == null ? "" : String(f.workers),
  termMonths: String(f.termMonths),
  hoursPerVisit: String(f.hoursPerVisit),
  monthlyFee: String(f.monthlyFee),
});

type Filter = "all" | "draft" | "sent" | "signed" | "closed";

// 実施者: 電子契約(産業医業務委託契約)の作成・送信・状況の確認
export function ContractsPanel({ companies }: { companies: Company[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // 作成・編集フォーム
  const [editing, setEditing] = useState<{ id: string | null; form: Form; companyId: string; accessCode: string; clearCode: boolean; note: string; hadCode: boolean } | null>(null);
  const [preview, setPreview] = useState(false);

  const load = async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("contracts").select(COLS).order("updated_at", { ascending: false });
    if (error) setMsg({ ok: false, text: `読み込めませんでした: ${error.message}(SQL 0033 が未実行の可能性があります)` });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        const st = displayStatus(r.status, r.token_expires_at);
        if (filter === "all") return true;
        if (filter === "draft") return st === "draft";
        if (filter === "sent") return st === "sent" || st === "expired";
        if (filter === "signed") return st === "signed";
        return st === "declined" || st === "cancelled";
      }),
    [rows, filter]
  );

  const run = async (label: string, url: string, body: unknown, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(true);
    setMsg(null);
    const r = await postJson(url, body);
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.json.error ?? `${label}できませんでした` });
      return false;
    }
    setMsg({ ok: true, text: `${label}しました` });
    await load();
    return true;
  };

  const startNew = (base?: ContractFields, companyId = "") => {
    setEditing({ id: null, form: toForm(base ?? DEFAULT_FIELDS), companyId, accessCode: "", clearCode: false, note: "", hadCode: false });
    setPreview(false);
    setMsg(null);
  };
  const startEdit = (r: Row) => {
    setEditing({ id: r.id, form: toForm({ ...DEFAULT_FIELDS, ...r.fields }), companyId: r.company_id ?? "", accessCode: "", clearCode: false, note: r.note ?? "", hadCode: false });
    setPreview(false);
    setMsg(null);
  };

  // 企業を選んだら、会社名・事業場名・所在地・労働者数を登録情報から入れる(空欄のところだけ)
  const pickCompany = async (id: string) => {
    if (!editing) return;
    setEditing({ ...editing, companyId: id });
    if (!id) return;
    const supabase = createClient();
    const { data } = await supabase.from("companies").select("name, office_name, address, workers").eq("id", id).maybeSingle();
    if (!data) return;
    setEditing((cur) =>
      cur && cur.companyId === id
        ? {
            ...cur,
            form: {
              ...cur.form,
              partyName: cur.form.partyName || data.name || "",
              partyOfficeName: cur.form.partyOfficeName || data.office_name || "",
              partyAddress: cur.form.partyAddress || data.address || "",
              workers: cur.form.workers || (data.workers ? String(data.workers) : ""),
            },
          }
        : cur
    );
  };

  const parsed = editing ? parseContractFields(editing.form as unknown as Record<string, unknown>) : null;

  const save = async (thenSend: boolean) => {
    if (!editing || !parsed) return;
    if (!parsed.ok) {
      setMsg({ ok: false, text: parsed.error });
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await postJson<{ id: string }>("/api/contracts/save", {
      id: editing.id,
      companyId: editing.companyId || null,
      fields: parsed.value,
      accessCode: editing.accessCode,
      clearAccessCode: editing.clearCode,
      note: editing.note,
    });
    setBusy(false);
    if (!r.ok) {
      setMsg({ ok: false, text: r.json.error ?? "保存できませんでした" });
      return;
    }
    if (thenSend) {
      if (
        !window.confirm(
          `${parsed.value.signerName} 様(${parsed.value.signerEmail})に署名用のリンクをメールで送ります。送信すると文面が確定し、乙(当事務所)の合意が記録されます。よろしいですか？`
        )
      ) {
        setMsg({ ok: true, text: "下書きを保存しました(送信はしていません)" });
        setEditing(null);
        await load();
        return;
      }
      const s = await postJson("/api/contracts/send", { id: r.json.id });
      if (!s.ok) {
        setMsg({ ok: false, text: s.json.error ?? "送信できませんでした(下書きは保存されています)" });
        setEditing(null);
        await load();
        return;
      }
      setMsg({ ok: true, text: "契約書を送信しました。署名が完了するとメールでお知らせします" });
    } else {
      setMsg({ ok: true, text: "下書きを保存しました" });
    }
    setEditing(null);
    await load();
  };

  const resend = async (r: Row) => {
    const code = window.prompt(
      `${r.signer_name} 様に新しい署名用リンクを送ります(以前のリンクは無効になります)。\nアクセスコードを新しく設定する場合は4〜8桁の数字を入力してください。変えない場合は空のまま OK を押してください。`,
      ""
    );
    if (code === null) return;
    await run("再送", "/api/contracts/resend", { id: r.id, accessCode: code });
  };

  const input = { width: "100%", padding: "9px 11px", fontSize: 14, border: `1px solid ${brand.line}`, borderRadius: 9, boxSizing: "border-box" as const, marginTop: 4 };
  const label = { fontSize: 13, color: "#44534F", display: "block" as const };
  const field = (key: keyof Form, text: string, props: Record<string, unknown> = {}) =>
    editing && (
      <label style={label}>
        {text}
        <input value={editing.form[key] as string} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, [key]: e.target.value } })} style={input} {...props} />
      </label>
    );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>電子契約(産業医業務委託契約)</h3>
            <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8, margin: 0 }}>
              契約内容を入力して契約先の署名者にメールで送ると、署名者はリンクを開いて内容を確認し、電子署名(同意)します。送信の時点で文面が確定し、当事務所の合意も記録されます。
              署名が完了すると双方にメールが届き、契約書と合意締結証明をいつでも閲覧・印刷できます。書面・押印・収入印紙は不要です。
            </p>
          </div>
          {!editing && (
            <Btn tone="orange" onClick={() => startNew()}>
              ＋ 新しい契約書を作る
            </Btn>
          )}
        </div>
        {msg && (
          <p style={{ fontSize: 14, color: msg.ok ? brand.tealDark : "#B02A2A", background: msg.ok ? "#F2FAF9" : "#FFF6F6", padding: "8px 12px", borderRadius: 8, margin: "12px 0 0", lineHeight: 1.7 }}>
            {msg.text}
          </p>
        )}
      </Card>

      {editing && (
        <Card>
          <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 12px" }}>{editing.id ? "下書きを直す" : "新しい契約書"}</h3>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: "#44534F", marginBottom: 4 }}>契約先の企業(登録済みなら選ぶと会社情報が入ります。未登録でも作れます)</div>
            <CompanySelect companies={companies} value={editing.companyId} onChange={pickCompany} label="" />
          </div>

          <h4 style={h4}>甲(契約先)</h4>
          <div style={grid}>
            {field("partyName", "会社名(法人名)")}
            {field("partyOfficeName", "事業場名(本社・○○工場など。1つの場合は空でも可)")}
            {field("partyAddress", "事業場の所在地")}
            {field("workers", "労働者数(おおよそ・任意)", { inputMode: "numeric" })}
            {field("partyRepTitle", "代表者の役職")}
            {field("partyRepName", "代表者の氏名")}
          </div>

          <h4 style={h4}>署名する方(メールで署名用リンクを送ります)</h4>
          <div style={grid}>
            {field("signerName", "氏名")}
            {field("signerTitle", "役職(任意)")}
            {field("signerEmail", "メールアドレス", { type: "email" })}
            <label style={label}>
              アクセスコード(任意・4〜8桁の数字){editing.id ? " ※変える場合のみ入力" : ""}
              <input
                value={editing.accessCode}
                onChange={(e) => setEditing({ ...editing, accessCode: e.target.value })}
                inputMode="numeric"
                placeholder="電話などで別に伝える番号。より確実な本人確認に"
                style={input}
              />
              {editing.id && (
                <span style={{ fontSize: 12, color: "#5B6B6A", display: "inline-flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <input type="checkbox" checked={editing.clearCode} onChange={(e) => setEditing({ ...editing, clearCode: e.target.checked })} /> アクセスコードを使わない(設定を外す)
                </span>
              )}
            </label>
          </div>

          <h4 style={h4}>契約の条件</h4>
          <div style={grid}>
            {field("startDate", "契約開始日", { type: "date" })}
            {field("termMonths", "契約期間(か月)", { inputMode: "numeric" })}
            <label style={label}>
              期間満了後
              <select value={editing.form.autoRenew ? "yes" : "no"} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, autoRenew: e.target.value === "yes" } })} style={input}>
                <option value="yes">自動更新(1年ごと)</option>
                <option value="no">協議のうえ決める</option>
              </select>
            </label>
            <label style={label}>
              訪問の頻度
              <select value={editing.form.visitFrequency} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, visitFrequency: e.target.value as ContractFields["visitFrequency"] } })} style={input}>
                {VISIT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            {field("hoursPerVisit", "1回の訪問時間(時間・0.5刻み)", { inputMode: "decimal" })}
            {field("monthlyFee", "月額報酬(税込・円)", { inputMode: "numeric" })}
            <label style={label}>
              支払期日(請求書は月末送付)
              <select value={editing.form.paymentTiming} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, paymentTiming: e.target.value as ContractFields["paymentTiming"] } })} style={input}>
                {PAYMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...label, display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
              <input type="checkbox" checked={editing.form.includeStressCheck} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, includeStressCheck: e.target.checked } })} />
              ストレスチェックの実施者業務を含める(Web申込の利用料は別)
            </label>
          </div>
          <label style={{ ...label, marginTop: 12 }}>
            特記事項(任意。契約書の条項になります。空行で項を分けます)
            <textarea value={editing.form.specialTerms} onChange={(e) => setEditing({ ...editing, form: { ...editing.form, specialTerms: e.target.value } })} rows={3} style={{ ...input, fontFamily: "inherit" }} />
          </label>
          <label style={{ ...label, marginTop: 12 }}>
            メモ(実施者用。契約書には載りません)
            <input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} style={input} />
          </label>

          {parsed && !parsed.ok && <p style={{ fontSize: 13, color: "#B45415", margin: "12px 0 0" }}>{parsed.error}</p>}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <Btn tone="ghost" onClick={() => setPreview(!preview)} disabled={!parsed?.ok}>
              {preview ? "プレビューを閉じる" : "契約書をプレビュー"}
            </Btn>
            <Btn onClick={() => save(false)} disabled={busy || !parsed?.ok}>
              下書きを保存
            </Btn>
            <Btn tone="orange" onClick={() => save(true)} disabled={busy || !parsed?.ok}>
              保存して署名用リンクを送信
            </Btn>
            <Btn tone="ghost" onClick={() => setEditing(null)} disabled={busy} style={{ borderColor: brand.line, color: "#5B6B6A" }}>
              閉じる
            </Btn>
          </div>
          <p style={{ fontSize: 12, color: "#7A8886", margin: "10px 0 0", lineHeight: 1.7 }}>
            署名用リンクの有効期間は {SIGN_LINK_DAYS}日です(期限が切れたら一覧から再送できます)。送信後に内容を直すときは、取り消して新しく作ってください(「複製」で入力を引き継げます)。
          </p>
        </Card>
      )}

      {editing && preview && parsed?.ok && (
        <ContractSheet doc={renderContract(parsed.value, { contractNo: "(送信時に付きます)" })} otsuSign={null} koSign={null} watermark="プレビュー" />
      )}

      <Card>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {(
            [
              ["all", "すべて"],
              ["draft", "下書き"],
              ["sent", "署名待ち"],
              ["signed", "締結済み"],
              ["closed", "辞退・取消"],
            ] as [Filter, string][]
          ).map(([k, t]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              style={{
                background: filter === k ? brand.teal : "#fff",
                color: filter === k ? "#fff" : brand.tealDark,
                border: `1px solid ${brand.teal}`,
                borderRadius: 999,
                padding: "5px 12px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {t}
              {k !== "all" ? `(${rows.filter((r) => { const s = displayStatus(r.status, r.token_expires_at); return k === "draft" ? s === "draft" : k === "sent" ? s === "sent" || s === "expired" : k === "signed" ? s === "signed" : s === "declined" || s === "cancelled"; }).length})` : ""}
            </button>
          ))}
        </div>
        {loading ? (
          <p style={{ fontSize: 14, color: "#5B6B6A", margin: 0 }}>読み込み中…</p>
        ) : shown.length === 0 ? (
          <p style={{ fontSize: 14, color: "#5B6B6A", margin: 0 }}>該当する契約書はありません。</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {shown.map((r) => {
              const st = displayStatus(r.status, r.token_expires_at);
              return (
                <div key={r.id} style={{ border: `1px solid ${brand.line}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Badge tone={STATUS_LABEL[st].tone}>{STATUS_LABEL[st].label}</Badge>
                        <span style={{ fontSize: 12, color: "#7A8886" }}>{r.contract_no}</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: brand.ink, marginTop: 6 }}>{r.party_name}</div>
                      <div style={{ fontSize: 13, color: "#44534F", lineHeight: 1.8 }}>
                        署名者: {r.signer_name}
                        {r.signer_title ? `(${r.signer_title})` : ""} {r.signer_email}
                        <br />
                        開始 {formatJpDate(r.start_date)} / 月額 {(r.monthly_fee ?? 0).toLocaleString()}円(税込)
                        {r.sent_at ? ` / 送信 ${formatJst(r.sent_at)}` : ""}
                        {r.viewed_at && !r.signed_at ? ` / 閲覧 ${formatJst(r.viewed_at)}` : ""}
                        {r.signed_at ? ` / 締結 ${formatJst(r.signed_at)}` : ""}
                        {st === "sent" ? ` / 期限 ${formatJst(r.token_expires_at)}` : ""}
                        {r.decline_reason ? <><br />辞退の理由: {r.decline_reason}</> : null}
                        {r.note ? <><br /><span style={{ color: "#7A8886" }}>メモ: {r.note}</span></> : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <a href={`/contracts/${r.id}`} target="_blank" rel="noreferrer" style={{ ...small, background: "#fff", color: brand.tealDark, border: `1px solid ${brand.teal}` }}>
                        開く・印刷
                      </a>
                      {st === "draft" && (
                        <>
                          <button onClick={() => startEdit(r)} disabled={busy} style={small}>直す</button>
                          <button onClick={() => run("送信", "/api/contracts/send", { id: r.id }, `${r.signer_name} 様(${r.signer_email})に署名用リンクを送ります。よろしいですか？`)} disabled={busy} style={{ ...small, background: brand.orange }}>
                            送信
                          </button>
                          <button onClick={() => run("削除", "/api/contracts/cancel", { id: r.id }, "この下書きを削除します。よろしいですか？")} disabled={busy} style={{ ...small, background: "#8A9694" }}>
                            削除
                          </button>
                        </>
                      )}
                      {(st === "sent" || st === "expired") && (
                        <>
                          <button onClick={() => resend(r)} disabled={busy} style={small}>再送</button>
                          <button onClick={() => run("取消", "/api/contracts/cancel", { id: r.id }, "送信を取り消します。署名者のリンクは無効になり、取消のメールが届きます。よろしいですか？")} disabled={busy} style={{ ...small, background: "#8A9694" }}>
                            取消
                          </button>
                        </>
                      )}
                      {st !== "draft" && (
                        <button onClick={() => startNew({ ...DEFAULT_FIELDS, ...r.fields }, r.company_id ?? "")} disabled={busy} style={{ ...small, background: "#fff", color: brand.tealDark, border: `1px solid ${brand.teal}` }}>
                          複製
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

const h4 = { fontSize: 14, color: brand.tealDark, margin: "14px 0 6px" } as const;
const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 } as const;
const small = {
  background: brand.teal,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap" as const,
} as const;
