"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { getFiscalYear } from "@/lib/fiscal";
import { loadPlanPrices } from "@/lib/plan-prices";
import { minSeats, pricingFor, type PlanPriceRow } from "@/lib/plan";

// 実施者向け: Web申込の料金を年度ごとに設定する。変更できるのは次の年度以降だけ
// (今年度の料金は、申込済みの企業との公平のため変えない)。設定すると、宣伝ページに改定のお知らせが自動で出る
export function PlanPricesPanel() {
  const current = getFiscalYear();
  const [rows, setRows] = useState<PlanPriceRow[] | null>(null);
  const [f, setF] = useState({ year: String(current + 1), unit: "", min: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(async () => setRows(await loadPlanPrices(createClient())), []);
  useEffect(() => {
    reload();
  }, [reload]);

  // 入力欄の初期値: その年度に適用される料金
  useEffect(() => {
    if (!rows) return;
    const p = pricingFor(rows, Number(f.year));
    setF((x) => ({ ...x, unit: x.unit || String(p.unitPrice), min: x.min || String(p.minTotal) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().rpc("office_set_plan_price", {
      p_year: Number(f.year),
      p_unit: Number(f.unit.normalize("NFKC")),
      p_min: Number(f.min.normalize("NFKC")),
      p_note: f.note,
    });
    setBusy(false);
    if (error) setMsg({ ok: false, text: error.message });
    else {
      setMsg({ ok: true, text: `${f.year}年度の料金を設定しました。宣伝ページ・利用規約・特商法の表示に、改定のお知らせが出ます。` });
      reload();
    }
  };
  const remove = async (y: number) => {
    if (!window.confirm(`${y}年度の料金設定を取り消しますか？(前の年度の料金がそのまま使われます)`)) return;
    const { error } = await createClient().rpc("office_delete_plan_price", { p_year: y });
    if (error) setMsg({ ok: false, text: error.message });
    else reload();
  };

  const input = { padding: "7px 10px", fontSize: 14, border: `1px solid ${brand.line}`, borderRadius: 8, width: 110 } as const;
  const small = { fontSize: 12, color: "#5B6B6A", lineHeight: 1.7 } as const;
  const cur = pricingFor(rows, current);

  return (
    <Card>
      <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 4px" }}>料金の設定(年度ごと・税込)</h3>
      <p style={{ ...small, margin: "0 0 10px" }}>
        今年度({current}年度)の料金: 受検者1名 {cur.unitPrice}円・最低料金 {cur.minTotal.toLocaleString()}円({minSeats(cur)}名まで)。
        料金は受検開始日の年度で決まります。変更できるのは次の年度以降だけで、設定すると宣伝ページに「料金改定のお知らせ」が自動で表示されます。
        申込済みの年度(人数の追加を含む)の料金は変わりません。
      </p>
      {rows === null ? (
        <div style={small}>読み込み中…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...small, color: "#8A5A00" }}>料金の表がまだありません(SQL 0026 の実行が必要です)。既定の料金で表示しています。</div>
      ) : (
        <table style={{ borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ background: "#EDF6F5", color: brand.tealDark }}>
              {["年度", "1名あたり", "最低料金", "メモ", ""].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fiscal_year} style={{ borderBottom: `1px solid ${brand.line}` }}>
                <td style={{ padding: "6px 10px", fontWeight: 700 }}>
                  {r.fiscal_year}年度{r.fiscal_year === current ? "(今年度)" : r.fiscal_year > current ? "(予定)" : ""}
                </td>
                <td style={{ padding: "6px 10px" }}>{r.unit_price.toLocaleString()}円</td>
                <td style={{ padding: "6px 10px" }}>{r.min_total.toLocaleString()}円</td>
                <td style={{ padding: "6px 10px", color: "#5B6B6A" }}>{r.note ?? ""}</td>
                <td style={{ padding: "6px 10px" }}>
                  {r.fiscal_year > current && (
                    <button onClick={() => remove(r.fiscal_year)} style={{ background: "none", border: 0, color: "#B02A2A", cursor: "pointer", fontSize: 12 }}>
                      取り消す
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 13, fontWeight: 700 }}>
          年度
          <br />
          <select value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} style={input}>
            {[1, 2, 3].map((d) => (
              <option key={d} value={current + d}>
                {current + d}年度
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>
          1名あたり(円)
          <br />
          <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} inputMode="numeric" style={input} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>
          最低料金(円)
          <br />
          <input value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} inputMode="numeric" style={input} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>
          メモ(社内用)
          <br />
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ ...input, width: 200 }} />
        </label>
        <Btn onClick={save} disabled={busy || !f.unit || !f.min} style={{ padding: "8px 16px", fontSize: 13 }}>
          {f.year}年度の料金を設定
        </Btn>
      </div>
      {msg && <div style={{ fontSize: 13, color: msg.ok ? brand.tealDark : "#B02A2A", marginTop: 8 }}>{msg.text}</div>}
    </Card>
  );
}
