"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Btn, Card } from "@/components/ui";
import { EmailTypoHint } from "@/components/EmailTypoHint";
import { brand } from "@/lib/brand";
import { normalizeBizId, parseSignupInput } from "@/lib/plan";

const label = { fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 } as const;
const input = { width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 15, border: `1px solid ${brand.line}`, borderRadius: 10 } as const;
const hint = { fontSize: 12, color: "#8A9694", margin: "4px 0 0", lineHeight: 1.7 } as const;
const field = { marginBottom: 14 } as const;
const section = { fontSize: 15, color: brand.tealDark, margin: "18px 0 10px", paddingTop: 12, borderTop: `1px solid ${brand.line}` } as const;

// 会社(事業場)と担当者の登録。お支払いは、登録後にログインした画面で年度ごとに行う
export function SignupForm({ enabled }: { enabled: boolean }) {
  const [f, setF] = useState({
    companyName: "",
    bizId: "",
    noBizId: false,
    officeName: "",
    address: "",
    workers: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    password: "",
    agreeTerms: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [done, setDone] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const biz = normalizeBizId(f.bizId);
  const workersN = Number(f.workers.normalize("NFKC"));

  const submit = async () => {
    setErr(null);
    setExists(false);
    const check = parseSignupInput(f);
    if (!check.ok) return setErr(check.error);
    setBusy(true);
    try {
      const res = await fetch("/api/plan/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      const json = await res.json();
      if (!res.ok) {
        setExists(Boolean(json.exists));
        throw new Error(json.error ?? "登録できませんでした");
      }
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  if (done) {
    return (
      <Card style={{ maxWidth: 640, margin: "0 auto" }}>
        <Badge>確認メールを送りました</Badge>
        <h1 style={{ fontSize: 21, color: brand.ink, margin: "12px 0 10px" }}>会社のご登録ありがとうございます</h1>
        <ol style={{ fontSize: 14, color: "#44534F", lineHeight: 1.9, paddingLeft: 20, margin: "0 0 10px" }}>
          <li>{f.contactEmail} に届いた確認メールのリンクを開いてください(ログインした状態になります)</li>
          <li>ストレスチェックの担当者としての確認(人事権を持たないこと)を行ってください</li>
          <li>表示される「ストレスチェックのお申込み」で、受検予定人数と受検期間を入れてお支払いください</li>
        </ol>
        <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8 }}>
          来年度以降も、ログインして同じ画面からお申し込みいただけます(会社の登録は今回だけです)。
          30分たってもメールが届かない場合は、迷惑メールフォルダをご確認のうえ support@mestate.jp までご連絡ください。
        </p>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 640, margin: "0 auto" }}>
      <Badge tone="orange">Web申込</Badge>
      <h1 style={{ fontSize: 21, color: brand.ink, margin: "12px 0 6px" }}>会社の登録</h1>
      <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.8, margin: "0 0 12px" }}>
        はじめに会社(事業場)とご担当者さまを登録します(無料)。お支払いは、登録後にログインした画面で、受検予定人数と受検期間を入れて行います。
        2年目以降も同じ画面から申し込めるので、会社の登録は最初の1回だけです。
      </p>
      <p style={{ fontSize: 13, color: brand.tealDark, background: "#F4FAF9", border: `1px solid ${brand.line}`, borderRadius: 8, padding: "10px 12px", lineHeight: 1.7, margin: "0 0 12px" }}>
        <strong>すでに登録済みの企業さま</strong>は、
        <Link href="/login?next=/jimu" style={{ color: brand.tealDark, fontWeight: 700 }}>ログイン</Link>
        してお申し込みください。うえまつ産業医事務所と産業医の契約をいただいている企業さまは、お申込み不要です。
      </p>
      {!enabled && (
        <p style={{ fontSize: 13, color: "#8A6B2E", background: "#FBF3E3", border: "1px solid #EFD9A8", borderRadius: 8, padding: "10px 12px", lineHeight: 1.7 }}>
          現在、Web申込は準備中です。お急ぎの場合は support@mestate.jp までお問い合わせください。
        </p>
      )}

      <h2 style={{ ...section, borderTop: "none", paddingTop: 0 }}>会社・事業場</h2>
      <div style={field}>
        <label style={label}>会社名</label>
        <input style={input} value={f.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="例: 株式会社〇〇" maxLength={100} />
      </div>
      <div style={field}>
        <label style={label}>登録番号(インボイス)または法人番号</label>
        <input
          style={{ ...input, width: 260 }}
          value={f.bizId}
          disabled={f.noBizId}
          onChange={(e) => set("bizId", e.target.value)}
          placeholder="例: T1234567890123"
          maxLength={20}
        />
        <p style={{ ...hint, color: biz === "invalid" && f.bizId ? "#B02A2A" : "#8A9694" }}>
          {biz === "invalid" && f.bizId
            ? "登録番号は「T」と数字13桁、法人番号は数字13桁です。"
            : "同じ会社の二重登録を防ぐために使います。登録番号(T+13桁)・法人番号(13桁)のどちらでも構いません。"}
        </p>
        <label style={{ display: "inline-flex", gap: 6, fontSize: 13, marginTop: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={f.noBizId} onChange={(e) => setF((p) => ({ ...p, noBizId: e.target.checked, bizId: e.target.checked ? "" : p.bizId }))} />
          どちらも持っていない(個人事業主で登録番号のない場合など)
        </label>
      </div>
      <div style={field}>
        <label style={label}>事業場名</label>
        <input style={input} value={f.officeName} onChange={(e) => set("officeName", e.target.value)} placeholder="例: 本社、京都工場" maxLength={100} />
        <p style={hint}>ストレスチェックは事業場(本社・工場・店舗など)ごとに行います。事業場が1つの場合は「本社」などとご記入ください。</p>
      </div>
      <div style={field}>
        <label style={label}>事業場の所在地</label>
        <input style={input} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="例: 京都府京都市中京区〇〇町1-2" maxLength={200} />
      </div>
      <div style={field}>
        <label style={label}>事業場の労働者数</label>
        <input style={{ ...input, width: 140 }} value={f.workers} onChange={(e) => set("workers", e.target.value)} inputMode="numeric" placeholder="例: 30" /> 名
        <p style={hint}>パート・アルバイトを含め、この事業場で働いている方の人数です。</p>
        {Number.isInteger(workersN) && workersN >= 50 && (
          <p style={{ ...hint, color: "#8A6B2E" }}>
            50人以上の事業場には産業医の選任義務があります。選任がお済みでない場合は support@mestate.jp までご相談ください。
          </p>
        )}
      </div>

      <h2 style={section}>ご担当者(実施事務従事者)</h2>
      <p style={{ ...hint, marginTop: -4, marginBottom: 10 }}>
        受検の案内や面接指導の申出の確認を行う、社内の窓口の方です。法令上、人事権(解雇・昇進・異動の決定権)のない方に限られます。
        ご担当者は登録後に画面から追加できます(担当者の交代や複数人での担当に)。
      </p>
      <div style={field}>
        <label style={label}>氏名</label>
        <input style={input} value={f.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="例: 山田 花子" maxLength={60} />
      </div>
      <div style={field}>
        <label style={label}>メールアドレス(ログインに使います)</label>
        <input style={input} type="email" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="例: hanako@example.co.jp" maxLength={200} />
        <EmailTypoHint email={f.contactEmail} onFix={(v) => set("contactEmail", v)} />
      </div>
      <div style={field}>
        <label style={label}>パスワード(8文字以上)</label>
        <input style={{ ...input, width: 260 }} type="password" value={f.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
      </div>
      <div style={field}>
        <label style={label}>電話番号</label>
        <input style={{ ...input, width: 220 }} type="tel" value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="例: 075-000-0000" maxLength={30} />
      </div>

      <label style={{ display: "flex", gap: 8, fontSize: 13, color: brand.ink, lineHeight: 1.7, margin: "6px 0 14px", cursor: "pointer" }}>
        <input type="checkbox" checked={f.agreeTerms} onChange={(e) => set("agreeTerms", e.target.checked)} style={{ marginTop: 4 }} />
        <span>
          <Link href="/plan/terms" target="_blank" style={{ color: brand.tealDark }}>利用規約</Link>と
          <Link href="/privacy" target="_blank" style={{ color: brand.tealDark }}>個人情報の取扱い</Link>
          に同意します。
        </span>
      </label>

      {err && (
        <p style={{ fontSize: 13, color: "#B02A2A", margin: "0 0 10px", lineHeight: 1.7 }}>
          {err}
          {exists && (
            <>
              {" "}
              <Link href="/login?next=/jimu" style={{ color: brand.tealDark, fontWeight: 700 }}>ログイン画面へ</Link>
            </>
          )}
        </p>
      )}
      <Btn tone="orange" onClick={submit} disabled={!enabled || busy} style={{ width: "100%" }}>
        {busy ? "登録しています…" : "会社を登録する(無料)"}
      </Btn>
      <p style={{ ...hint, textAlign: "center" }}>この時点ではお支払いは発生しません。</p>
    </Card>
  );
}
