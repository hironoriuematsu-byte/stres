"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import {
  addDays,
  defaultEndOf,
  fiscalYearOf,
  formatJpDate,
  INTERVIEW_OPTIONS,
  InterviewOption,
  jstToday,
  maxEndOf,
  MIN_TOTAL_SEATS,
  periodError,
  priceNew,
  QUOTE_MAILTO,
  seatsGranted,
  WEB_MAX_SEATS,
} from "@/lib/plan";

type PlanRow = { fiscal_year: number; seats: number; exam_end: string; interview_option: string | null; workers: number | null };

// Web申込の企業の継続申込(次年度以降)。今年度の申込がない、または今年度の受検期間が終わったときに表示する。
// 同じ企業に新しい年度を追加するので、従業員のアカウントと過去の結果がそのまま引き継がれる
export function PlanRenewPanel({ companyId, currentYear }: { companyId: string; currentYear: number }) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const today = jstToday();
  const firstStart = addDays(today, 1);
  const [f, setF] = useState({
    workers: "",
    seats: "",
    examStart: firstStart,
    examEnd: defaultEndOf(firstStart),
    interviewOption: "" as InterviewOption | "",
    agreeTerms: false,
    agreeProcedure: false,
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("exam_plans")
      .select("fiscal_year, seats, exam_end, interview_option, workers")
      .eq("company_id", companyId)
      .order("fiscal_year", { ascending: false })
      .then(({ data, error }) => {
        const rows = error ? [] : ((data as PlanRow[]) ?? []);
        setPlans(rows);
        const last = rows[0];
        if (last) {
          setF((p) => ({
            ...p,
            workers: last.workers ? String(last.workers) : "",
            seats: String(last.seats),
            interviewOption: (last.interview_option as InterviewOption) ?? "",
          }));
        }
      });
  }, [companyId]);

  if (!plans || plans.length === 0) return null; // Web申込の企業ではない
  const cur = plans.find((p) => p.fiscal_year === currentYear);
  const nextYear = fiscalYearOf(f.examStart || firstStart);
  // 今年度の申込があり、まだ受検期間中(または開始前)なら出さない
  if (cur && today <= cur.exam_end) return null;
  if (plans.some((p) => p.fiscal_year === nextYear) && !open) return null;

  const seatsN = Number(f.seats.normalize("NFKC"));
  const workersN = Number(f.workers.normalize("NFKC"));
  const over = Number.isInteger(seatsN) && Number.isInteger(workersN) && workersN > 0 && seatsN > workersN;
  const quote = Number.isInteger(seatsN) && seatsN > WEB_MAX_SEATS;
  const price = Number.isInteger(seatsN) && seatsN >= 1 && !quote ? priceNew(seatsN) : null;
  const large = Number.isInteger(workersN) && workersN >= 50;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const input = { padding: "7px 10px", fontSize: 14, border: `1px solid ${brand.line}`, borderRadius: 8 } as const;
  const small = { fontSize: 12, color: "#5B6B6A", lineHeight: 1.7 } as const;

  const submit = async () => {
    setErr(null);
    const pe = periodError(f.examStart, f.examEnd, today);
    if (pe) return setErr(pe);
    if (!f.interviewOption) return setErr("産業医面接指導の担当を選んでください");
    setBusy(true);
    try {
      const res = await fetch("/api/plan/renew", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "お申込みを受け付けられませんでした");
      window.location.href = json.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h3 style={{ fontSize: 16, color: brand.ink, margin: 0 }}>次の年度のお申込み</h3>
          <p style={{ ...small, margin: "4px 0 0" }}>
            {cur ? `${currentYear}年度の受検期間は終了しました。` : `${currentYear}年度のお申込みはまだありません。`}
            同じ画面から次の年度を申し込めます。従業員の皆さまのアカウントと過去の結果は、そのまま引き継がれます。
          </p>
        </div>
        {!open && (
          <Btn tone="orange" onClick={() => setOpen(true)} style={{ padding: "8px 16px", fontSize: 14 }}>
            申し込む
          </Btn>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${brand.line}`, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              事業場の労働者数
              <br />
              <input style={{ ...input, width: 90 }} value={f.workers} onChange={(e) => set("workers", e.target.value)} inputMode="numeric" /> 名
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              受検予定人数
              <br />
              <input style={{ ...input, width: 90 }} value={f.seats} onChange={(e) => set("seats", e.target.value)} inputMode="numeric" /> 名
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              開始日
              <br />
              <input
                type="date"
                style={input}
                value={f.examStart}
                min={today}
                onChange={(e) => {
                  const s = e.target.value;
                  setF((p) => ({ ...p, examStart: s, examEnd: s ? defaultEndOf(s) : p.examEnd }));
                }}
              />
            </label>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              締切日
              <br />
              <input
                type="date"
                style={input}
                value={f.examEnd}
                min={f.examStart}
                max={f.examStart ? maxEndOf(f.examStart) : undefined}
                onChange={(e) => set("examEnd", e.target.value)}
              />
            </label>
          </div>
          {over && <div style={{ ...small, color: "#B02A2A" }}>事業場の労働者数を超えています。桁の打ち間違いがないかご確認ください。</div>}
          {quote && (
            <div style={{ ...small, color: "#8A6B2E" }}>
              {WEB_MAX_SEATS}名を超える場合は個別にお見積りします(割引があります)。
              <a href={QUOTE_MAILTO} style={{ color: brand.tealDark, fontWeight: 700 }}>お見積りのご依頼(メール)</a>
            </div>
          )}
          <div style={small}>
            {f.examStart && `${fiscalYearOf(f.examStart)}年度のお申込みになります。締切は${formatJpDate(maxEndOf(f.examStart))}まで無料で延ばせます。`}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>産業医面接指導の担当</div>
            {INTERVIEW_OPTIONS.map((o) => {
              const disabled = o.value === "sanpo" && large;
              return (
                <label key={o.value} style={{ display: "block", fontSize: 13, color: disabled ? "#AAB6B4" : brand.ink, marginBottom: 4 }}>
                  <input
                    type="radio"
                    name="renew-iv"
                    disabled={disabled}
                    checked={f.interviewOption === o.value}
                    onChange={() => set("interviewOption", o.value)}
                    style={{ marginRight: 6 }}
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
          <label style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.7 }}>
            <input type="checkbox" checked={f.agreeProcedure} onChange={(e) => set("agreeProcedure", e.target.checked)} />
            <span>実施方法を事業者として決定し、受検の前に従業員へ周知します。受検の有無・結果・面接指導の申出を理由とした不利益な取扱いはしません。</span>
          </label>
          <label style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.7 }}>
            <input type="checkbox" checked={f.agreeTerms} onChange={(e) => set("agreeTerms", e.target.checked)} />
            <span>
              <Link href="/plan/terms" target="_blank" style={{ color: brand.tealDark }}>利用規約</Link>に同意します。お申込み後のお客さまのご都合によるキャンセル・返金はお受けできません。
            </span>
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={small}>お支払い金額(税込)</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: brand.tealDark }}>{price ? `${price.total.toLocaleString()}円` : "—"}</div>
              {price && seatsN < MIN_TOTAL_SEATS && <div style={small}>最低料金({seatsGranted(seatsN)}名まで)</div>}
            </div>
            <Btn tone="orange" onClick={submit} disabled={busy || !price || over || !f.agreeTerms || !f.agreeProcedure}>
              {busy ? "決済画面を準備しています…" : "お支払いに進む(クレジットカード)"}
            </Btn>
          </div>
          {err && <p style={{ fontSize: 13, color: "#B02A2A", margin: 0 }}>{err}</p>}
        </div>
      )}
    </Card>
  );
}
