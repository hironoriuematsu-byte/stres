"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { formatJpDate, jstDate, jstToday } from "@/lib/plan";
import { PlanOrdersPanel } from "@/components/PlanOrdersPanel";
import { PlanPricesPanel } from "@/components/PlanPricesPanel";

type Row = {
  company_id: string;
  name: string;
  code: string;
  office_name: string | null;
  biz_id: string | null;
  address: string | null;
  workers: number | null;
  web_signup: boolean;
  created_at: string;
  jimu_names: string | null;
  seats: number | null;
  used: number;
  exam_start: string | null;
  exam_end: string | null;
  orders: number;
  paid_total: number;
  last_paid_at: string | null;
  last_year: number | null;
};

type Status = { key: "none" | "lapsed" | "before" | "open" | "closed" | "contract"; label: string; color: string; bg: string };

function statusOf(r: Row, year: number, today: string): Status {
  if (!r.web_signup) return { key: "contract", label: "顧問契約に切替済み", color: brand.tealDark, bg: "#E3F4F1" };
  if (!r.exam_start || !r.exam_end) {
    return r.last_year && r.last_year < year
      ? { key: "lapsed", label: `未申込(${r.last_year}年度は利用)`, color: "#B4561A", bg: "#FCEADC" }
      : { key: "none", label: "未申込", color: "#8A6B2E", bg: "#FBF3E3" };
  }
  if (today < r.exam_start) return { key: "before", label: "受検期間前", color: "#8A6B2E", bg: "#FBF3E3" };
  if (today > r.exam_end) return { key: "closed", label: "受検期間終了", color: "#5B6B6A", bg: "#EEF1F1" };
  return { key: "open", label: "受検期間中", color: brand.tealDark, bg: "#E3F4F1" };
}

// 実施者: Web申込(カード決済)の企業を、選任・顧問契約の企業とは分けて管理する画面。
//   企業一覧 … 企業ごとの今年度の状況(未申込・受検期間中など)・受検者数・支払いの合計・担当者。企業を開く・顧問契約への切り替え
//   申込・支払い … 申込ごとの記録、売上明細のCSV、領収書、受検期間・人数枠の変更、企業の統合
export function WebCompaniesPanel({ fiscalYear, onOpenCompany }: { fiscalYear: number; onOpenCompany: (companyId: string) => void }) {
  const [view, setView] = useState<"companies" | "orders" | "prices">("companies");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "none" | "contract" | "all">("active");
  const [q, setQ] = useState("");
  const today = jstToday();

  const load = async () => {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("office_web_companies", { p_year: fiscalYear });
    if (error) setErr(`読み込めませんでした: ${error.message}(SQL 0025 が未実行の可能性があります)`);
    setRows((data as Row[]) ?? []);
  };
  useEffect(() => {
    setRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalYear]);

  const setWeb = async (r: Row, web: boolean) => {
    if (
      !window.confirm(
        web
          ? `「${r.name}」をWeb申込(カード決済・受検期間と人数枠あり)に戻します。よろしいですか？`
          : `「${r.name}」を顧問契約に切り替えます。以降は年度の申込(支払い)が不要になり、受検期間・人数枠の制限なく無料で使えます。\n担当者・従業員・過去の結果・支払いの記録はそのまま残ります。よろしいですか？`
      )
    )
      return;
    const supabase = createClient();
    const { error } = await supabase.rpc("office_set_web_signup", { p_company: r.company_id, p_web: web });
    setMsg(error ? `切り替えできませんでした: ${error.message}` : web ? `「${r.name}」をWeb申込に戻しました。` : `「${r.name}」を顧問契約に切り替えました。`);
    if (!error) load();
  };

  const summary = useMemo(() => {
    const list = rows ?? [];
    const web = list.filter((r) => r.web_signup);
    return {
      web: web.length,
      ordered: web.filter((r) => r.exam_start).length,
      none: web.filter((r) => !r.exam_start).length,
      contract: list.filter((r) => !r.web_signup).length,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const key = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      const st = statusOf(r, fiscalYear, today).key;
      const okFilter =
        filter === "all" ? true : filter === "contract" ? st === "contract" : filter === "none" ? st === "none" || st === "lapsed" : st !== "contract";
      const okQ =
        !key ||
        [r.name, r.code, r.office_name ?? "", r.biz_id ?? "", r.jimu_names ?? ""].some((v) => v.toLowerCase().includes(key));
      return okFilter && okQ;
    });
  }, [rows, filter, q, fiscalYear, today]);

  const cell = { padding: "8px 8px", fontSize: 12.5, verticalAlign: "top" } as const;
  const chip = (active: boolean) =>
    ({
      fontSize: 12.5,
      padding: "5px 12px",
      borderRadius: 999,
      border: `1px solid ${brand.teal}`,
      background: active ? brand.teal : "#fff",
      color: active ? "#fff" : brand.tealDark,
      fontWeight: 700,
      cursor: "pointer",
    }) as const;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button style={chip(view === "companies")} onClick={() => setView("companies")}>企業一覧</button>
        <button style={chip(view === "orders")} onClick={() => setView("orders")}>申込・支払い</button>
        <button style={chip(view === "prices")} onClick={() => setView("prices")}>料金の設定</button>
      </div>

      {view === "orders" ? (
        <PlanOrdersPanel />
      ) : view === "prices" ? (
        <PlanPricesPanel />
      ) : (
        <Card>
          <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 4px" }}>Web申込の企業({fiscalYear}年度)</h3>
          <p style={{ fontSize: 12, color: "#8A9694", margin: "0 0 10px", lineHeight: 1.7 }}>
            Web申込(カード決済)で登録した企業だけの一覧です。選任・顧問契約の企業は含みません(顧問契約に切り替えた企業は「顧問契約に切替済み」で表示)。
          </p>
          {err && <p style={{ fontSize: 13, color: "#B02A2A" }}>{err}</p>}
          {msg && <p style={{ fontSize: 13, color: brand.tealDark }}>{msg}</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 12 }}>
            {[
              ["Web申込で利用中", `${summary.web}社`],
              [`${fiscalYear}年度 申込済み`, `${summary.ordered}社`],
              [`${fiscalYear}年度 未申込`, `${summary.none}社`],
              ["顧問契約に切替済み", `${summary.contract}社`],
            ].map(([k, v]) => (
              <div key={k} style={{ background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ fontSize: 11.5, color: "#5B6B6A" }}>{k}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: brand.tealDark }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            {(
              [
                ["active", "利用中"],
                ["none", "今年度 未申込"],
                ["contract", "顧問契約に切替済み"],
                ["all", "すべて"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} style={chip(filter === k)} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="会社名・企業コード・番号・担当者で検索"
              style={{ flex: "1 1 220px", padding: "6px 10px", fontSize: 13, border: `1px solid ${brand.line}`, borderRadius: 8 }}
            />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
              <thead>
                <tr style={{ background: "#EDF6F5", color: brand.tealDark, fontSize: 12 }}>
                  {["会社・事業場", "担当者", `${fiscalYear}年度`, "支払い", "登録日", "操作"].map((h) => (
                    <th key={h} style={{ ...cell, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows === null && (
                  <tr>
                    <td colSpan={6} style={{ ...cell, color: "#8A9694" }}>読み込み中…</td>
                  </tr>
                )}
                {rows !== null && shown.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...cell, color: "#8A9694" }}>該当する企業はありません。</td>
                  </tr>
                )}
                {shown.map((r) => {
                  const st = statusOf(r, fiscalYear, today);
                  return (
                    <tr key={r.company_id} style={{ borderBottom: `1px solid ${brand.line}` }}>
                      <td style={cell}>
                        <strong>{r.name}</strong> {r.office_name}
                        <div style={{ color: "#8A9694" }}>
                          {r.code}
                          {r.biz_id ? ` / 番号 ${r.biz_id}` : " / 番号なし"}
                          {r.workers ? ` / ${r.workers}名` : ""}
                        </div>
                      </td>
                      <td style={cell}>{r.jimu_names ?? <span style={{ color: "#B02A2A" }}>担当者なし</span>}</td>
                      <td style={cell}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                          {st.label}
                        </span>
                        {r.exam_start && (
                          <div style={{ marginTop: 4, whiteSpace: "nowrap" }}>
                            {formatJpDate(r.exam_start)}〜{formatJpDate(r.exam_end)}
                            <br />
                            受検 {r.used}名 / {r.seats}名
                          </div>
                        )}
                      </td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        {r.orders}回・{r.paid_total.toLocaleString()}円
                        {r.last_paid_at && <div style={{ color: "#8A9694" }}>最終 {formatJpDate(jstDate(r.last_paid_at))}</div>}
                      </td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>{formatJpDate(jstDate(r.created_at))}</td>
                      <td style={{ ...cell, whiteSpace: "nowrap" }}>
                        <Btn tone="ghost" onClick={() => onOpenCompany(r.company_id)} style={{ padding: "4px 10px", fontSize: 12 }}>
                          開く
                        </Btn>
                        <div style={{ marginTop: 4 }}>
                          {r.web_signup ? (
                            <button
                              onClick={() => setWeb(r, false)}
                              style={{ background: "none", border: "none", padding: 0, color: brand.tealDark, fontWeight: 700, cursor: "pointer", fontSize: 12 }}
                            >
                              顧問契約に切り替え
                            </button>
                          ) : (
                            <button
                              onClick={() => setWeb(r, true)}
                              style={{ background: "none", border: "none", padding: 0, color: "#8A9694", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                            >
                              Web申込に戻す
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: "#8A9694", margin: "8px 0 0", lineHeight: 1.7 }}>
            「開く」でその企業の結果一覧・面接指導・集団分析などを表示します。申込ごとの記録・売上明細・領収書・企業の統合は「申込・支払い」から。
          </p>
        </Card>
      )}
    </div>
  );
}
