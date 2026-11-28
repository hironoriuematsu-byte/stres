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
  type ContractKind,
  type ContractRow,
  COOP_TRAVEL_OPTIONS,
  DEFAULT_FIELDS,
  displayStatus,
  FEE_PERIOD_OPTIONS,
  FEE_TAX_OPTIONS,
  feeShort,
  formatJst,
  isCoopKind,
  KIND_OPTIONS,
  kindLabel,
  parseContractFields,
  PAYMENT_OPTIONS,
  renderContract,
  SIGN_LINK_DAYS,
  STATUS_LABEL,
  visitOptionsFor,
} from "@/lib/contract";

type Row = Omit<ContractRow, "document" | "template_version" | "completion_hash" | "service_signature" | "document_hash" | "signed_name" | "signed_title">;

const COLS =
  "id, contract_no, kind, status, company_id, fields, party_name, signer_name, signer_email, signer_title, monthly_fee, fee_period, start_date, token_expires_at, sent_at, viewed_at, signed_at, declined_at, decline_reason, cancelled_at, note, created_at, updated_at, review_sent_at, review_viewed_at, review_feedback_at, review_feedback_kind, review_feedback";

// フォームの入力(数値も文字列のまま持ち、保存時に parseContractFields で確認する)
type Form = { [K in keyof ContractFields]: ContractFields[K] extends boolean ? boolean : string };
const toForm = (f: ContractFields): Form => ({
  ...f,
  workers: f.workers == null ? "" : String(f.workers),
  termMonths: String(f.termMonths),
  hoursPerVisit: String(f.hoursPerVisit),
  fee: String(f.fee),
  coopExtraFee: String(f.coopExtraFee),
});

type Filter = "all" | "draft" | "sent" | "signed" | "closed";
type Editing = { id: string | null; form: Form; companyId: string; accessCode: string; clearCode: boolean; note: string };

// 実施者: 電子契約(顧問先との選任契約・顧問契約・覚書、協力医師との業務委託契約)の作成・送信・状況の確認
export function ContractsPanel({ companies }: { companies: Company[] }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [preview, setPreview] = useState(false);

  const load = async () => {
    const supabase = createClient();
    const { data, error } = await supabase.from("contracts").select(COLS).order("updated_at", { ascending: false });
    if (error) setMsg({ ok: false, text: `読み込めませんでした: ${error.message}(SQL 0033〜0035 が未実行の可能性があります)` });
    setRows((data as Row[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const matches = (r: Row, k: Filter) => {
    const st = displayStatus(r.status, r.token_expires_at);
    if (k === "all") return true;
    if (k === "draft") return st === "draft";
    if (k === "sent") return st === "sent" || st === "expired";
    if (k === "signed") return st === "signed";
    return st === "declined" || st === "cancelled";
  };
  const shown = useMemo(() => rows.filter((r) => matches(r, filter)), [rows, filter]);

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
    setEditing({ id: null, form: toForm({ ...DEFAULT_FIELDS, ...(base ?? {}) }), companyId, accessCode: "", clearCode: false, note: "" });
    setPreview(false);
    setMsg(null);
  };
  const startEdit = (r: Row) => {
    setEditing({ id: r.id, form: toForm({ ...DEFAULT_FIELDS, ...r.fields }), companyId: r.company_id ?? "", accessCode: "", clearCode: false, note: r.note ?? "" });
    setPreview(false);
    setMsg(null);
  };
  const setForm = (patch: Partial<Form>) => setEditing((cur) => (cur ? { ...cur, form: { ...cur.form, ...patch } } : cur));

  // 企業を選んだら、登録情報から会社名などを入れる(空欄のところだけ)。
  // 協力医師との契約では「担当する顧問先」の欄に入れる
  const pickCompany = async (id: string) => {
    if (!editing) return;
    setEditing({ ...editing, companyId: id });
    if (!id) return;
    const supabase = createClient();
    const { data } = await supabase.from("companies").select("name, office_name, address, workers").eq("id", id).maybeSingle();
    if (!data) return;
    setEditing((cur) => {
      if (!cur || cur.companyId !== id) return cur;
      if (isCoopKind(cur.form.kind)) {
        return { ...cur, form: { ...cur.form, coopClientName: cur.form.coopClientName || [data.name, data.office_name].filter(Boolean).join(" ") } };
      }
      return {
        ...cur,
        form: {
          ...cur.form,
          partyName: cur.form.partyName || data.name || "",
          partyOfficeName: cur.form.partyOfficeName || data.office_name || "",
          partyAddress: cur.form.partyAddress || data.address || "",
          workers: cur.form.workers || (data.workers ? String(data.workers) : ""),
        },
      };
    });
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
      if (!window.confirm(`${parsed.value.signerName} 様(${parsed.value.signerEmail})に署名用のリンクをメールで送ります。送信すると文面が確定し、当事務所の合意が記録されます。よろしいですか？`)) {
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

  // 確認用リンク(署名なし)。すでに送っていれば同じリンクで送り直す
  const reviewSend = async (r: Row) => {
    const message = window.prompt(
      r.review_sent_at
        ? `${r.signer_name} 様に、同じ確認用リンクをもう一度送ります(直した案文が見られます)。メールに添えるひとことがあれば入力してください(任意)。`
        : `${r.signer_name} 様(${r.signer_email})に、署名なしで案文を確認できるリンクをメールで送ります。メールに添えるひとことがあれば入力してください(任意)。`,
      ""
    );
    if (message === null) return;
    await run("確認用リンクを送信", "/api/contracts/review-send", { id: r.id, message });
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
        <input value={editing.form[key] as string} onChange={(e) => setForm({ [key]: e.target.value } as Partial<Form>)} style={input} {...props} />
      </label>
    );
  const select = <K extends keyof Form>(key: K, text: string, options: { value: string; label: string }[]) =>
    editing && (
      <label style={label}>
        {text}
        <select value={editing.form[key] as string} onChange={(e) => setForm({ [key]: e.target.value } as Partial<Form>)} style={input}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  const check = (key: keyof Form, text: React.ReactNode, style: React.CSSProperties = {}) =>
    editing && (
      <label style={{ ...label, display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", ...style }}>
        <input type="checkbox" checked={editing.form[key] as boolean} onChange={(e) => setForm({ [key]: e.target.checked } as Partial<Form>)} style={{ marginTop: 3 }} />
        <span>{text}</span>
      </label>
    );

  const kind = (editing?.form.kind ?? "appointed") as ContractKind;
  const isMain = kind === "appointed" || kind === "advisory";
  const isMemo = kind === "memo_coop";
  const isCoop = isCoopKind(kind);
  const corp = kind === "coop_corporate";
  const yearly = editing?.form.feePeriod === "yearly";
  const taxWord = editing?.form.feeTax === "excluded" ? "税別" : "税込";
  // 個人の協力医師で給与扱いのときは消費税の区分がない
  const hideTax = kind === "coop_individual" && editing?.form.coopWithholding;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>電子契約</h3>
            <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8, margin: 0 }}>
              顧問先との契約(選任契約・顧問契約・協力医師の覚書)と、協力医師との業務委託契約を、クラウドサイン型の電子署名で締結します。
              下書きの段階では「確認用リンク(署名なし)」を相手に送って案文を詰められます(相手は「問題なし / 修正希望」を返せます)。内容が固まったら署名用リンクを送ると、署名者はリンクを開いて内容を確認し、電子署名(同意)します。送信の時点で文面が確定し、当事務所の合意も記録されます。
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

          <h4 style={h4}>契約の種類</h4>
          {(["顧問先との契約", "協力医師との契約"] as const).map((g) => (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#7A8886", margin: "0 0 6px" }}>{g}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
                {KIND_OPTIONS.filter((k) => k.group === g).map((k) => {
                  const sel = editing.form.kind === k.value;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => {
                        // 種類によって選べない訪問の頻度は月1回に戻す
                        const vf = visitOptionsFor(k.value).some((o) => o.value === editing.form.visitFrequency) ? editing.form.visitFrequency : "monthly";
                        setForm({ kind: k.value, visitFrequency: vf });
                      }}
                      style={{
                        textAlign: "left",
                        border: sel ? `2px solid ${brand.teal}` : `1px solid ${brand.line}`,
                        background: sel ? "#E2F3F1" : "#fff",
                        borderRadius: 12,
                        padding: "12px 14px",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 15, fontWeight: 800, color: sel ? brand.tealDark : brand.ink }}>
                        {k.label}
                        <span style={{ fontSize: 12, fontWeight: 400, color: "#5B6B6A", marginLeft: 8 }}>{k.title}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#44534F", lineHeight: 1.7, marginTop: 4 }}>{k.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ margin: "14px 0" }}>
            <div style={{ fontSize: 13, color: "#44534F", marginBottom: 4 }}>
              {isCoop ? "担当する顧問先(登録済みなら選ぶと名称が入ります。協力医師との契約は顧問先の担当者からは見えません)" : "契約先の企業(登録済みなら選ぶと会社情報が入ります。未登録でも作れます)"}
            </div>
            <CompanySelect companies={companies} value={editing.companyId} onChange={pickCompany} label="" />
          </div>

          {/* ---- 当事者 ---- */}
          {!isCoop && (
            <>
              <h4 style={h4}>甲({isMemo ? "顧問先" : "契約先"})</h4>
              <div style={grid}>
                {field("partyName", "会社名(法人名)")}
                {field("partyOfficeName", "事業場名(本社・○○工場など。1つの場合は空でも可)")}
                {field("partyAddress", "事業場の所在地")}
                {isMain && field("workers", "労働者数(おおよそ・任意)", { inputMode: "numeric" })}
                {field("partyRepTitle", "代表者の役職")}
                {field("partyRepName", "代表者の氏名")}
              </div>
            </>
          )}
          {isCoop && !corp && (
            <>
              <h4 style={h4}>乙(協力医師・個人)</h4>
              <div style={grid}>
                {field("partyName", "医師の氏名")}
                {field("partyAddress", "住所")}
                {field("coopDoctorNote", "資格・所属など(任意。例: 日本医師会認定産業医・○○病院)")}
              </div>
            </>
          )}
          {corp && (
            <>
              <h4 style={h4}>乙(協力医師の所属法人)</h4>
              <div style={grid}>
                {field("partyName", "法人名(例: 医療法人○○会)")}
                {field("partyOfficeName", "施設名(任意。例: ○○クリニック)")}
                {field("partyAddress", "所在地")}
                {field("partyRepTitle", "代表者の役職(例: 理事長)")}
                {field("partyRepName", "代表者の氏名")}
                {field("coopInvoiceNo", "適格請求書発行事業者の登録番号(任意。T+13桁)")}
                {field("coopDoctorName", "担当医師の氏名(本業務を行う所属医師)")}
              </div>
            </>
          )}

          {/* ---- 覚書: 原契約と協力医師 ---- */}
          {isMemo && (
            <>
              <h4 style={h4}>原契約(すでに締結している契約)</h4>
              <div style={grid}>
                {field("originalTitle", "原契約の名称(例: 産業医選任契約書)")}
                {field("originalDate", "原契約の締結日", { type: "date" })}
                {select("feePeriod", "原契約の報酬の単位", FEE_PERIOD_OPTIONS)}
                {select("feeTax", "税込 / 税別", FEE_TAX_OPTIONS)}
                {field("fee", `原契約の報酬(${yearly ? "年額" : "月額"}・${taxWord}・円。覚書に記載しない場合は 0)`, { inputMode: "numeric" })}
              </div>
              <h4 style={h4}>協力医師</h4>
              <div style={grid}>
                {field("coopDoctorName", "協力医師の氏名")}
                {field("coopDoctorNote", "所属・資格など(任意。氏名の後ろに括弧書きで入ります)")}
                <label style={{ ...label, gridColumn: "1 / -1" }}>
                  協力医師が分担する業務
                  <input value={editing.form.coopDuties} onChange={(e) => setForm({ coopDuties: e.target.value })} style={input} />
                </label>
              </div>
            </>
          )}

          {/* ---- 協力医師との契約: 顧問先・業務 ---- */}
          {isCoop && (
            <>
              <h4 style={h4}>委託する業務</h4>
              <div style={grid}>
                <label style={{ ...label, gridColumn: "1 / -1" }}>
                  担当する顧問先(会社名・事業場。契約書に「顧問先」として入ります)
                  <input value={editing.form.coopClientName} onChange={(e) => setForm({ coopClientName: e.target.value })} style={input} />
                </label>
                <label style={{ ...label, gridColumn: "1 / -1" }}>
                  委託する業務(分担業務)
                  <input value={editing.form.coopDuties} onChange={(e) => setForm({ coopDuties: e.target.value })} style={input} />
                </label>
                {select("visitFrequency", "訪問の頻度", visitOptionsFor(kind))}
                {field("hoursPerVisit", "1回の訪問時間(時間・0.5刻み)", { inputMode: "decimal" })}
              </div>
              {check("coopExtraIncluded", <>顧問先の求めによる訪問日の臨時の面接指導・意見書の作成を報酬に含める(外すと1件あたりの額を定めます)</>, { marginTop: 10 })}
              {!editing.form.coopExtraIncluded && <div style={{ ...grid, marginTop: 8 }}>{field("coopExtraFee", `臨時の面接指導・意見書 1件あたり(${taxWord}・円)`, { inputMode: "numeric" })}</div>}
            </>
          )}

          {/* ---- 署名者 ---- */}
          <h4 style={h4}>署名する方(メールで署名用リンクを送ります)</h4>
          <div style={grid}>
            {field("signerName", isCoop && !corp ? "氏名(通常は医師本人)" : "氏名")}
            {field("signerTitle", "役職(任意)")}
            {field("signerEmail", "メールアドレス", { type: "email" })}
            <label style={label}>
              アクセスコード(任意・4〜8桁の数字){editing.id ? " ※変える場合のみ入力" : ""}
              <input value={editing.accessCode} onChange={(e) => setEditing({ ...editing, accessCode: e.target.value })} inputMode="numeric" placeholder="電話などで別に伝える番号。より確実な本人確認に" style={input} />
              {editing.id && (
                <span style={{ fontSize: 12, color: "#5B6B6A", display: "inline-flex", gap: 6, alignItems: "center", marginTop: 4 }}>
                  <input type="checkbox" checked={editing.clearCode} onChange={(e) => setEditing({ ...editing, clearCode: e.target.checked })} /> アクセスコードを使わない(設定を外す)
                </span>
              )}
            </label>
          </div>

          {/* ---- 条件 ---- */}
          {isMemo ? (
            <>
              <h4 style={h4}>効力</h4>
              <div style={grid}>{field("startDate", "覚書の効力発生日", { type: "date" })}</div>
            </>
          ) : (
            <>
              <h4 style={h4}>契約の条件</h4>
              <div style={grid}>
                {field("startDate", "契約開始日", { type: "date" })}
                {field("termMonths", "契約期間(か月)", { inputMode: "numeric" })}
                <label style={label}>
                  期間満了後
                  <select value={editing.form.autoRenew ? "yes" : "no"} onChange={(e) => setForm({ autoRenew: e.target.value === "yes" })} style={input}>
                    <option value="yes">自動更新(1年ごと)</option>
                    <option value="no">協議のうえ決める</option>
                  </select>
                </label>
                {isMain && select("visitFrequency", "訪問の頻度", visitOptionsFor(kind))}
                {isMain && editing.form.visitFrequency !== "on_request" && field("hoursPerVisit", "1回の訪問時間(時間・0.5刻み)", { inputMode: "decimal" })}
                {select("feePeriod", "報酬の単位", FEE_PERIOD_OPTIONS)}
                {!hideTax && select("feeTax", "税込 / 税別", FEE_TAX_OPTIONS)}
                {field("fee", `${yearly ? "年額" : "月額"}の報酬(${hideTax ? "源泉徴収前" : taxWord}・円)`, { inputMode: "numeric" })}
                {isMain && select("paymentTiming", `支払期日(${yearly ? "年1回の請求書を受け取った月を基準" : "毎月末に送る請求書の月を基準"})`, PAYMENT_OPTIONS)}
                {isCoop && select("coopTravel", "交通費", COOP_TRAVEL_OPTIONS)}
                {isMain && check("includeStressCheck", "ストレスチェックの実施者業務を含める(Web申込の利用料は別)", { marginTop: 22 })}
              </div>
              {kind === "coop_individual" && (
                <div style={{ marginTop: 10 }}>
                  {check(
                    "coopWithholding",
                    <>
                      報酬を<b>給与として扱い、所得税を源泉徴収</b>する(国税庁の質疑応答事例「産業医の報酬」に沿う扱い。消費税は不課税。外すと事業所得として請求書払い・源泉なしになります)
                      <br />
                      <span style={{ fontSize: 12, color: "#5B6B6A" }}>事務所経由の委託にこの扱いが当てはまるかは税理士に確認のうえ選んでください。</span>
                    </>
                  )}
                </div>
              )}
              {isCoop && (
                <p style={{ fontSize: 12, color: "#5B6B6A", margin: "8px 0 0", lineHeight: 1.7 }}>
                  支払期日は、業務を行った月の末日を受領日として翌月末日(受領日から60日以内)に固定しています。30日前の解約予告・不更新の予告、ハラスメントの相談窓口({"support@mestate.jp"})、直接契約の事前協議(期間中と終了後1年・担当した顧問先に限る)は条文に入ります。
                </p>
              )}
            </>
          )}

          {/* ---- 選任契約の協力医師条項 ---- */}
          {kind === "appointed" && (
            <div style={{ marginTop: 14, border: `1px solid ${brand.line}`, borderRadius: 12, padding: "12px 14px", background: editing.form.coopDoctor ? "#F7FBFA" : "#fff" }}>
              {check(
                "coopDoctor",
                <>
                  <b>協力医師の条項を入れる</b>(職場巡視・衛生委員会などを別の医師が分担し、契約先がその医師を産業医として追加選任する)
                  <br />
                  <span style={{ fontSize: 12, color: "#5B6B6A" }}>
                    復委任の承諾(民法第644条の2)・追加選任と選任報告・役割分担・料金と責任は変わらないこと・守秘義務・指揮命令をしないことを1つの条にまとめて入れます。すでに契約のある顧問先には「覚書」を使います。
                  </span>
                </>
              )}
              {editing.form.coopDoctor && (
                <div style={{ ...grid, marginTop: 10 }}>
                  {field("coopDoctorName", "協力医師の氏名")}
                  {field("coopDoctorNote", "所属・資格など(任意。氏名の後ろに括弧書きで入ります)")}
                  <label style={{ ...label, gridColumn: "1 / -1" }}>
                    協力医師が分担する業務
                    <input value={editing.form.coopDuties} onChange={(e) => setForm({ coopDuties: e.target.value })} style={input} />
                  </label>
                </div>
              )}
            </div>
          )}

          <label style={{ ...label, marginTop: 12 }}>
            特記事項(任意。契約書の条項になります。空行で項を分けます)
            <textarea value={editing.form.specialTerms} onChange={(e) => setForm({ specialTerms: e.target.value })} rows={3} style={{ ...input, fontFamily: "inherit" }} />
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

      {editing && preview && parsed?.ok && <ContractSheet doc={renderContract(parsed.value, { contractNo: "(送信時に付きます)" })} otsuSign={null} koSign={null} watermark="プレビュー" />}

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
              {k !== "all" ? `(${rows.filter((r) => matches(r, k)).length})` : ""}
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
              const f = r.fields;
              const coopRow = isCoopKind(r.kind);
              return (
                <div key={r.id} style={{ border: `1px solid ${brand.line}`, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <Badge tone={STATUS_LABEL[st].tone}>{STATUS_LABEL[st].label}</Badge>
                        <span style={{ fontSize: 12, color: "#7A8886" }}>{r.contract_no}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: coopRow ? "#B45415" : brand.tealDark }}>{kindLabel(r.kind)}</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: brand.ink, marginTop: 6 }}>{r.party_name}</div>
                      <div style={{ fontSize: 13, color: "#44534F", lineHeight: 1.8 }}>
                        署名者: {r.signer_name}
                        {r.signer_title ? `(${r.signer_title})` : ""} {r.signer_email}
                        <br />
                        {r.kind === "memo_coop" ? `効力 ${formatJpDate(r.start_date)}` : `開始 ${formatJpDate(r.start_date)}`}
                        {r.kind === "memo_coop" && !(r.monthly_fee && r.monthly_fee > 0) ? "" : ` / ${feeShort(r.monthly_fee, r.fee_period, f?.feeTax)}`}
                        {coopRow && f?.coopClientName ? ` / 顧問先 ${f.coopClientName}` : ""}
                        {!coopRow && f?.coopDoctor && f.coopDoctorName ? ` / 協力医師 ${f.coopDoctorName}` : ""}
                        {r.kind === "coop_corporate" && f?.coopDoctorName ? ` / 担当医師 ${f.coopDoctorName}` : ""}
                        {r.sent_at ? ` / 送信 ${formatJst(r.sent_at)}` : ""}
                        {r.viewed_at && !r.signed_at ? ` / 閲覧 ${formatJst(r.viewed_at)}` : ""}
                        {r.signed_at ? ` / 締結 ${formatJst(r.signed_at)}` : ""}
                        {st === "sent" ? ` / 期限 ${formatJst(r.token_expires_at)}` : ""}
                        {r.status === "draft" && r.review_sent_at ? (
                          <>
                            <br />
                            <span style={{ color: brand.tealDark }}>
                              確認用リンク送付 {formatJst(r.review_sent_at)}
                              {r.review_viewed_at ? ` / 閲覧 ${formatJst(r.review_viewed_at)}` : " / 未閲覧"}
                            </span>
                          </>
                        ) : null}
                        {r.status === "draft" && r.review_feedback_kind ? (
                          <>
                            <br />
                            <span style={{ color: r.review_feedback_kind === "ok" ? brand.tealDark : "#B45415", fontWeight: 700 }}>
                              相手の回答({formatJst(r.review_feedback_at)}): {r.review_feedback_kind === "ok" ? "この内容で問題なし → 署名用リンクを送れます" : "修正を希望"}
                            </span>
                            {r.review_feedback ? <span style={{ color: "#44534F" }}> / {r.review_feedback}</span> : null}
                          </>
                        ) : null}
                        {r.decline_reason ? (
                          <>
                            <br />
                            辞退の理由: {r.decline_reason}
                          </>
                        ) : null}
                        {r.note ? (
                          <>
                            <br />
                            <span style={{ color: "#7A8886" }}>メモ: {r.note}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <a href={`/contracts/${r.id}`} target="_blank" rel="noreferrer" style={{ ...small, background: "#fff", color: brand.tealDark, border: `1px solid ${brand.teal}` }}>
                        開く・印刷
                      </a>
                      {st === "draft" && (
                        <>
                          <button onClick={() => startEdit(r)} disabled={busy} style={small}>
                            直す
                          </button>
                          <button onClick={() => reviewSend(r)} disabled={busy} style={{ ...small, background: "#fff", color: "#B45415", border: `1px solid ${brand.orange}` }}>
                            {r.review_sent_at ? "確認用リンクを再送" : "確認用リンクを送る(署名なし)"}
                          </button>
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
                          <button onClick={() => resend(r)} disabled={busy} style={small}>
                            再送
                          </button>
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
