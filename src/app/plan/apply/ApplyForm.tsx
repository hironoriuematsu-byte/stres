"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Btn, Card } from "@/components/ui";
import { EmailTypoHint } from "@/components/EmailTypoHint";
import { brand } from "@/lib/brand";
import {
  INTERVIEW_OPTIONS,
  InterviewOption,
  MIN_TOTAL_SEATS,
  addDays,
  defaultEndOf,
  formatJpDate,
  jstToday,
  maxEndOf,
  parseApplyInput,
  priceNew,
  seatsGranted,
} from "@/lib/plan";

const label = { fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 } as const;
const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, border: `1px solid ${brand.line}`, borderRadius: 10 } as const;
const hint = { fontSize: 12, color: "#8A9694", margin: "4px 0 0", lineHeight: 1.7 } as const;
const field = { marginBottom: 14 } as const;
const section = { fontSize: 15, color: brand.tealDark, margin: "18px 0 10px", paddingTop: 12, borderTop: `1px solid ${brand.line}` } as const;

export function ApplyForm({ enabled, initialSeats, canceled }: { enabled: boolean; initialSeats: string; canceled: boolean }) {
  const today = jstToday();
  const firstStart = addDays(today, 1); // 標準は翌日開始(周知の時間を取る)
  const [f, setF] = useState({
    companyName: "",
    officeName: "",
    address: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    workers: "",
    seats: initialSeats,
    questionnaire: "57" as "57" | "80",
    examStart: firstStart,
    examEnd: defaultEndOf(firstStart),
    interviewOption: "" as InterviewOption | "",
    agreeTerms: false,
    agreeProcedure: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const seatsN = Number(f.seats.normalize("NFKC"));
  const price = Number.isInteger(seatsN) && seatsN >= 1 && seatsN <= 10000 ? priceNew(seatsN) : null;
  const workersN = Number(f.workers.normalize("NFKC"));
  const large = Number.isInteger(workersN) && workersN >= 50;
  const check = parseApplyInput(f, today);

  const submit = async () => {
    setErr(null);
    if (!check.ok) {
      setErr(check.error);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/plan/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? "お申込みを受け付けられませんでした");
      window.location.href = json.url; // Stripe の決済画面へ
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Card style={{ maxWidth: 640, margin: "0 auto" }}>
      <Badge tone="orange">Web申込</Badge>
      <h1 style={{ fontSize: 21, color: brand.ink, margin: "12px 0 6px" }}>ストレスチェックのお申込み</h1>
      <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>
        入力後、クレジットカードの決済画面に進みます。お支払いが完了すると、ご担当者さまに招待メールが届きます。
        料金・内容は<Link href="/plan" style={{ color: brand.tealDark }}>サービスのご案内</Link>をご覧ください。
      </p>

      {!enabled && (
        <p style={{ fontSize: 13, color: "#8A6B2E", background: "#FBF3E3", border: "1px solid #EFD9A8", borderRadius: 8, padding: "10px 12px", lineHeight: 1.7 }}>
          現在、Web申込は準備中です。お急ぎの場合は support@mestate.jp までお問い合わせください。
        </p>
      )}
      {canceled && (
        <p style={{ fontSize: 13, color: "#8A6B2E", background: "#FBF3E3", border: "1px solid #EFD9A8", borderRadius: 8, padding: "10px 12px" }}>
          お支払いは完了していません。内容を確認して、もう一度お進みください。
        </p>
      )}

      <h2 style={{ ...section, borderTop: "none", paddingTop: 0 }}>会社・事業場</h2>
      <div style={field}>
        <label style={label}>会社名</label>
        <input style={input} value={f.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="例: 株式会社〇〇" maxLength={100} />
      </div>
      <div style={field}>
        <label style={label}>事業場名(任意)</label>
        <input style={input} value={f.officeName} onChange={(e) => set("officeName", e.target.value)} placeholder="例: 本社、京都工場" maxLength={100} />
      </div>
      <div style={field}>
        <label style={label}>事業場の所在地</label>
        <input style={input} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="例: 京都府京都市中京区〇〇町1-2" maxLength={200} />
      </div>
      <div style={field}>
        <label style={label}>事業場の労働者数</label>
        <input style={{ ...input, width: 140 }} value={f.workers} onChange={(e) => set("workers", e.target.value)} inputMode="numeric" placeholder="例: 30" /> 名
        <p style={hint}>パート・アルバイトを含め、この事業場で働いている方の人数です(受検の対象外の方も含みます)。</p>
        {large && (
          <p style={{ ...hint, color: "#8A6B2E" }}>
            50人以上の事業場には産業医の選任義務があります。選任がお済みでない場合は support@mestate.jp までご相談ください。
          </p>
        )}
      </div>

      <h2 style={section}>受検</h2>
      <div style={field}>
        <label style={label}>受検予定人数</label>
        <input style={{ ...input, width: 140 }} value={f.seats} onChange={(e) => set("seats", e.target.value)} inputMode="numeric" placeholder="例: 25" /> 名
        <p style={hint}>
          足りなくなった場合は、受検期間中に1名から追加できます(余った分の返金はありません)。
          {price && seatsN < MIN_TOTAL_SEATS && ` 最低料金のため、${seatsGranted(seatsN)}名まで受検できます。`}
        </p>
      </div>
      <div style={{ ...field, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div>
          <label style={label}>開始日</label>
          <input
            type="date"
            style={{ ...input, width: 180 }}
            value={f.examStart}
            min={today}
            onChange={(e) => {
              const s = e.target.value;
              setF((p) => ({ ...p, examStart: s, examEnd: s ? defaultEndOf(s) : p.examEnd }));
            }}
          />
        </div>
        <div>
          <label style={label}>締切日</label>
          <input
            type="date"
            style={{ ...input, width: 180 }}
            value={f.examEnd}
            min={f.examStart}
            max={f.examStart ? maxEndOf(f.examStart) : undefined}
            onChange={(e) => set("examEnd", e.target.value)}
          />
        </div>
      </div>
      <p style={{ ...hint, marginTop: -8, marginBottom: 14 }}>
        標準は4週間です。締切は受検期間中に{f.examStart ? `${formatJpDate(maxEndOf(f.examStart))}まで` : "開始から3か月まで"}無料で延ばせます。
      </p>
      <div style={field}>
        <label style={label}>調査票</label>
        {(
          [
            ["57", "57項目版(標準)", "厚生労働省「職業性ストレス簡易調査票」。所要時間は約10分です。"],
            ["80", "80項目版", "57項目に職場環境などの23項目を加えたもの(新職業性ストレス簡易調査票の短縮版)。所要時間は約15分です。"],
          ] as const
        ).map(([v, t, d]) => (
          <label key={v} style={{ display: "block", fontSize: 14, color: brand.ink, marginBottom: 6, cursor: "pointer" }}>
            <input type="radio" name="q" checked={f.questionnaire === v} onChange={() => set("questionnaire", v)} style={{ marginRight: 6 }} />
            {t}
            <span style={{ display: "block", fontSize: 12, color: "#8A9694", marginLeft: 22 }}>{d}</span>
          </label>
        ))}
      </div>
      <div style={field}>
        <label style={label}>産業医面接指導の担当</label>
        {INTERVIEW_OPTIONS.map((o) => {
          const disabled = o.value === "sanpo" && large;
          return (
            <label key={o.value} style={{ display: "block", fontSize: 14, color: disabled ? "#AAB6B4" : brand.ink, marginBottom: 6, cursor: disabled ? "not-allowed" : "pointer" }}>
              <input
                type="radio"
                name="iv"
                disabled={disabled}
                checked={f.interviewOption === o.value}
                onChange={() => set("interviewOption", o.value)}
                style={{ marginRight: 6 }}
              />
              {o.label}
              <span style={{ display: "block", fontSize: 12, color: "#8A9694", marginLeft: 22 }}>{o.desc}</span>
            </label>
          );
        })}
      </div>

      <h2 style={section}>ご担当者(実施事務従事者)</h2>
      <p style={{ ...hint, marginTop: -4, marginBottom: 10 }}>
        受検の案内や面接指導の申出の確認を行う、社内の窓口の方です。法令上、人事権(解雇・昇進・異動の決定権)のない方に限られます。
      </p>
      <div style={field}>
        <label style={label}>氏名</label>
        <input style={input} value={f.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="例: 山田 花子" maxLength={60} />
      </div>
      <div style={field}>
        <label style={label}>メールアドレス</label>
        <input style={input} type="email" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="例: hanako@example.co.jp" maxLength={200} />
        <EmailTypoHint email={f.contactEmail} onFix={(v) => set("contactEmail", v)} />
        <p style={hint}>このアドレスに招待メール・領収書が届きます。</p>
      </div>
      <div style={field}>
        <label style={label}>電話番号</label>
        <input style={{ ...input, width: 220 }} type="tel" value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="例: 075-000-0000" maxLength={30} />
      </div>

      <h2 style={section}>確認</h2>
      <label style={{ display: "flex", gap: 8, fontSize: 13, color: brand.ink, lineHeight: 1.7, marginBottom: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={f.agreeProcedure} onChange={(e) => set("agreeProcedure", e.target.checked)} style={{ marginTop: 4 }} />
        <span>
          実施方法(実施者・受検期間・結果の取扱い)を事業者として決定し、受検の前に従業員へ周知します
          {large ? "(50人以上の事業場のため、衛生委員会で調査審議します)" : ""}。
          受検の有無・結果・面接指導の申出を理由とした不利益な取扱いはしません。
        </span>
      </label>
      <label style={{ display: "flex", gap: 8, fontSize: 13, color: brand.ink, lineHeight: 1.7, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={f.agreeTerms} onChange={(e) => set("agreeTerms", e.target.checked)} style={{ marginTop: 4 }} />
        <span>
          <Link href="/plan/terms" target="_blank" style={{ color: brand.tealDark }}>利用規約</Link>
          (ストレスチェックの実施の委託に関する定めを含みます)と
          <Link href="/privacy" target="_blank" style={{ color: brand.tealDark }}>個人情報の取扱い</Link>
          に同意します。
        </span>
      </label>

      <div style={{ background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 12, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#5B6B6A" }}>お支払い金額(税込)</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: brand.tealDark }}>{price ? `${price.total.toLocaleString()}円` : "—"}</div>
        {price && (
          <div style={{ fontSize: 12, color: "#5B6B6A" }}>
            {seatsN < MIN_TOTAL_SEATS ? `最低料金(${seatsGranted(seatsN)}名まで)` : `330円 × ${seatsN}名`}・集団分析込み
          </div>
        )}
      </div>

      {err && <p style={{ fontSize: 13, color: "#B02A2A", margin: "0 0 10px", lineHeight: 1.7 }}>{err}</p>}
      <Btn tone="orange" onClick={submit} disabled={!enabled || busy} style={{ width: "100%" }}>
        {busy ? "決済画面を準備しています…" : "お支払いに進む(クレジットカード)"}
      </Btn>
      <p style={{ ...hint, textAlign: "center" }}>
        カード情報は決済代行会社(Stripe)の画面で入力され、当事務所には届きません。
        <br />
        <Link href="/plan/tokushoho" style={{ color: brand.tealDark }}>特定商取引法に基づく表記</Link>
      </p>
    </Card>
  );
}
