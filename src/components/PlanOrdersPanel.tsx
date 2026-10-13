"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { formatJpDate, interviewOptionLabel, jstToday, SALES_HEADERS, salesRows, SalesOrder } from "@/lib/plan";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { CompanySelect } from "@/components/CompanySelect";
import { Company } from "@/lib/types";

type Order = {
  id: string;
  kind: "new" | "add_seats" | "renew";
  status: string;
  company_id: string | null;
  fiscal_year: number;
  seats: number;
  amount: number;
  company_name: string;
  office_name: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  workers: number | null;
  exam_start: string | null;
  exam_end: string | null;
  interview_option: string | null;
  error: string | null;
  created_at: string;
  paid_at: string | null;
  stripe_payment_intent: string | null;
  stripe_invoice_id: string | null;
};

type Plan = { company_id: string; fiscal_year: number; seats: number; exam_start: string; exam_end: string; max_end: string };

const STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "決済待ち", color: "#8A9694" },
  paid: { label: "支払い済み(開設前)", color: "#8A6B2E" },
  provisioned: { label: "開設済み", color: brand.tealDark },
  failed: { label: "要確認", color: "#B02A2A" },
  expired: { label: "決済されず終了", color: "#8A9694" },
};

// 実施者: Web申込(クレジットカード決済)の一覧と、受検期間・人数枠の手動変更
export function PlanOrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const codes = Object.fromEntries(companies.map((c) => [c.id, c.code])); // 企業ID → 企業コード(同じ名前の企業を見分ける)
  // 企業の統合(継続利用の企業が誤って新規で申し込んだときのリカバリ)
  const [merge, setMerge] = useState<{ fromId: string; fromLabel: string; toId: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [edit, setEdit] = useState<Plan | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 売上明細の期間(既定は今月)
  const thisMonth = jstToday().slice(0, 7);
  const [from, setFrom] = useState(`${thisMonth}-01`);
  const [to, setTo] = useState(jstToday());

  const load = async () => {
    const supabase = createClient();
    const [o, p, c] = await Promise.all([
      supabase.from("plan_orders").select("*").order("created_at", { ascending: false }).limit(300),
      supabase.from("exam_plans").select("company_id, fiscal_year, seats, exam_start, exam_end, max_end"),
      supabase.from("companies").select("id, name, code, web_signup").order("name"),
    ]);
    setCompanies((c.data as Company[]) ?? []);
    setOrders((o.data as Order[]) ?? []);
    setPlans((p.data as Plan[]) ?? []);
    if (o.error) setMsg(`読み込めませんでした: ${o.error.message}(SQL 0025 が未実行の可能性があります)`);
  };
  useEffect(() => {
    load();
  }, []);

  const saveEdit = async () => {
    if (!edit) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("office_update_exam_plan", {
      p_company: edit.company_id,
      p_year: edit.fiscal_year,
      p_seats: edit.seats,
      p_start: edit.exam_start,
      p_end: edit.exam_end,
      p_max_end: edit.max_end,
    });
    setMsg(error ? error.message : "受検期間・人数枠を変更しました。");
    if (!error) {
      setEdit(null);
      load();
    }
  };

  const isWeb = (id: string | null) => Boolean(id && (companies.find((c) => c.id === id) as (Company & { web_signup?: boolean }) | undefined)?.web_signup);
  const setWeb = async (id: string, name: string, web: boolean) => {
    if (
      !window.confirm(
        web
          ? `「${name}」をWeb申込(カード決済・受検期間と人数枠あり)に戻します。よろしいですか？`
          : `「${name}」を顧問契約に切り替えます。以降は年度の申込(支払い)が不要になり、受検期間・人数枠の制限なく無料で使えます。\n担当者・従業員・過去の結果・支払いの記録はそのまま残ります。よろしいですか？`
      )
    )
      return;
    const supabase = createClient();
    const { error } = await supabase.rpc("office_set_web_signup", { p_company: id, p_web: web });
    setMsg(error ? `切り替えできませんでした: ${error.message}` : web ? `「${name}」をWeb申込に戻しました。` : `「${name}」を顧問契約(無料・制限なし)に切り替えました。`);
    if (!error) load();
  };

  const runMerge = async () => {
    if (!merge?.toId) return;
    const to = companies.find((c) => c.id === merge.toId);
    if (
      !window.confirm(
        `「${merge.fromLabel}」のデータ(受検期間・人数枠・配布URL・担当者・従業員・受検結果・申込の記録など)をすべて\n` +
          `「${to?.name}(${to?.code})」に移し、「${merge.fromLabel}」を削除します。元には戻せません。よろしいですか？`
      )
    )
      return;
    const supabase = createClient();
    const { data, error } = await supabase.rpc("office_merge_company", { p_from: merge.fromId, p_to: merge.toId });
    setMsg(error ? `統合できませんでした: ${error.message}` : String(data));
    if (!error) {
      setMerge(null);
      load();
    }
  };

  const exportSales = () => {
    const rows = salesRows(orders as SalesOrder[], from, to);
    if (rows.length === 0) {
      setMsg("指定した期間に売上はありません。");
      return;
    }
    const total = rows.reduce((a, r) => a + Number(r[8]), 0);
    downloadCsv(`売上明細_${from || "開始"}_${to || "現在"}.csv`, buildCsv(SALES_HEADERS, rows));
    setMsg(`${rows.length}件・合計${total.toLocaleString()}円(税込)の売上明細をダウンロードしました。`);
  };

  const shown = showAll ? orders : orders.filter((o) => o.status !== "pending" && o.status !== "expired");
  const cell = { padding: "7px 8px", fontSize: 12.5, verticalAlign: "top" } as const;
  const input = { padding: "5px 8px", fontSize: 13, border: `1px solid ${brand.line}`, borderRadius: 6 } as const;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: 0 }}>Web申込(クレジットカード決済)</h3>
        <label style={{ fontSize: 12, color: "#5B6B6A" }}>
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 決済されなかった申込も表示
        </label>
      </div>
      <p style={{ fontSize: 12, color: "#8A9694", margin: "4px 0 10px", lineHeight: 1.7 }}>
        お支払いが確認されると、企業・受検期間・配布URLが自動で作られ、担当者に招待メールが送られます。「要確認」は開設処理で問題があった申込です。
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13, margin: "0 0 10px", padding: "10px 12px", background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 10 }}>
        <strong style={{ color: brand.ink }}>売上明細(CSV)</strong>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={input} />
        〜
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={input} />
        <Btn tone="ghost" onClick={exportSales} style={{ padding: "6px 14px", fontSize: 13 }}>
          一括ダウンロード
        </Btn>
        <span style={{ fontSize: 12, color: "#8A9694" }}>決済日(日本時間)で集計。金額・消費税・税抜金額・Stripeの決済IDを含みます</span>
      </div>
      {msg && <p style={{ fontSize: 13, color: brand.tealDark }}>{msg}</p>}
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark, fontSize: 12 }}>
              {["申込日", "状態", "会社", "担当者", "内容", "金額", "受検期間・人数枠"].map((h) => (
                <th key={h} style={{ ...cell, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...cell, color: "#8A9694" }}>まだ申込はありません。</td>
              </tr>
            )}
            {shown.map((o) => {
              const plan = plans.find((p) => p.company_id === o.company_id && p.fiscal_year === o.fiscal_year);
              const st = STATUS[o.status] ?? { label: o.status, color: "#5B6B6A" };
              return (
                <tr key={o.id} style={{ borderBottom: `1px solid ${brand.line}` }}>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>{new Date(o.created_at).toLocaleDateString("ja-JP")}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap", color: st.color, fontWeight: 700 }}>
                    {st.label}
                    {o.error && <div style={{ fontWeight: 400, color: "#B02A2A", maxWidth: 220, whiteSpace: "normal" }}>{o.error}</div>}
                  </td>
                  <td style={cell}>
                    <strong>{o.company_name}</strong>
                    {o.office_name && <div>{o.office_name}</div>}
                    {o.company_id && codes[o.company_id] && <div style={{ color: "#8A9694" }}>企業コード {codes[o.company_id]}</div>}
                    {o.kind !== "add_seats" && o.company_id && codes[o.company_id] && (
                      isWeb(o.company_id) ? (
                        <button
                          onClick={() => setWeb(o.company_id!, o.company_name, false)}
                          style={{ display: "block", background: "none", border: "none", padding: 0, color: brand.tealDark, fontWeight: 700, cursor: "pointer", fontSize: 12 }}
                        >
                          顧問契約に切り替え
                        </button>
                      ) : (
                        <div style={{ fontSize: 12 }}>
                          <span style={{ color: brand.tealDark, fontWeight: 700 }}>顧問契約(無料)</span>{" "}
                          <button
                            onClick={() => setWeb(o.company_id!, o.company_name, true)}
                            style={{ background: "none", border: "none", padding: 0, color: "#8A9694", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                          >
                            Web申込に戻す
                          </button>
                        </div>
                      )
                    )}
                    {o.kind === "new" && o.company_id && codes[o.company_id] && (
                      <button
                        onClick={() =>
                          setMerge({ fromId: o.company_id!, fromLabel: `${o.company_name}(${codes[o.company_id!]})`, toId: "" })
                        }
                        style={{ background: "none", border: "none", padding: 0, color: brand.tealDark, fontWeight: 700, cursor: "pointer", fontSize: 12 }}
                      >
                        既存の企業に統合
                      </button>
                    )}
                    {o.workers != null && <div style={{ color: "#5B6B6A" }}>労働者 {o.workers}名</div>}
                  </td>
                  <td style={cell}>
                    {o.contact_name}
                    <div style={{ color: "#5B6B6A" }}>{o.contact_email}</div>
                    {o.contact_phone && <div style={{ color: "#5B6B6A" }}>{o.contact_phone}</div>}
                  </td>
                  <td style={cell}>
                    {o.kind !== "add_seats" ? (
                      <>
                        {o.kind === "renew" ? "継続" : "初年度"} {o.seats}名({o.fiscal_year}年度)
                        <div style={{ color: "#5B6B6A" }}>{interviewOptionLabel(o.interview_option)}</div>
                      </>
                    ) : (
                      <>人数追加 {o.seats}名</>
                    )}
                  </td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    {o.amount.toLocaleString()}円
                    {(o.status === "provisioned" || o.status === "paid") && (
                      <div>
                        <a href={`/plan/receipt/${o.id}`} target="_blank" rel="noreferrer" style={{ color: brand.tealDark, fontSize: 12 }}>
                          領収書
                        </a>
                      </div>
                    )}
                  </td>
                  <td style={cell}>
                    {plan ? (
                      <>
                        {formatJpDate(plan.exam_start)}〜{formatJpDate(plan.exam_end)}
                        <div style={{ color: "#5B6B6A" }}>枠 {plan.seats}名</div>
                        {o.kind !== "add_seats" && (
                          <button
                            onClick={() => setEdit({ ...plan })}
                            style={{ background: "none", border: "none", padding: 0, color: brand.tealDark, fontWeight: 700, cursor: "pointer", fontSize: 12 }}
                          >
                            変更
                          </button>
                        )}
                      </>
                    ) : o.exam_start ? (
                      <span style={{ color: "#8A9694" }}>
                        {formatJpDate(o.exam_start)}〜{formatJpDate(o.exam_end)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {merge && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: "#FBF3E3", border: "1px solid #EFD9A8", borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 4 }}>既存の企業に統合する(リカバリ用)</div>
          <p style={{ fontSize: 12, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 8px" }}>
            継続利用の企業が誤って新規で申し込んだ場合などに、「{merge.fromLabel}」を元の企業にまとめます。
            受検期間・人数枠(同じ年度があれば人数を合算)・配布URL(元の企業に同じ年度のURLが無ければ、配布済みのQRがそのまま使えます)・
            担当者・従業員・受検結果・面接指導の申出・申込と支払いの記録をすべて移します。操作はログに残ります。
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>統合先:</span>
            <CompanySelect
              companies={companies.filter((c) => c.id !== merge.fromId)}
              value={merge.toId}
              onChange={(id) => setMerge({ ...merge, toId: id })}
              label=""
            />
            <Btn tone="orange" onClick={runMerge} disabled={!merge.toId} style={{ padding: "6px 14px", fontSize: 13 }}>
              統合する
            </Btn>
            <Btn tone="ghost" onClick={() => setMerge(null)} style={{ padding: "6px 14px", fontSize: 13 }}>
              やめる
            </Btn>
          </div>
        </div>
      )}

      {edit && (
        <div style={{ marginTop: 14, padding: "12px 14px", background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: brand.ink, marginBottom: 8 }}>受検期間・人数枠の手動変更(返金・特別対応用。変更はログに残ります)</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
            <label>人数枠 <input style={{ ...input, width: 70 }} type="number" min={0} value={edit.seats} onChange={(e) => setEdit({ ...edit, seats: Number(e.target.value) })} /> 名</label>
            <label>開始 <input style={input} type="date" value={edit.exam_start} onChange={(e) => setEdit({ ...edit, exam_start: e.target.value })} /></label>
            <label>締切 <input style={input} type="date" value={edit.exam_end} onChange={(e) => setEdit({ ...edit, exam_end: e.target.value })} /></label>
            <label>延長の上限 <input style={input} type="date" value={edit.max_end} onChange={(e) => setEdit({ ...edit, max_end: e.target.value })} /></label>
            <Btn onClick={saveEdit} style={{ padding: "6px 14px", fontSize: 13 }}>保存</Btn>
            <Btn tone="ghost" onClick={() => setEdit(null)} style={{ padding: "6px 14px", fontSize: 13 }}>閉じる</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
