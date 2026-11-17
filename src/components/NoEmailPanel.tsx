"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { BirthDateInput } from "@/components/BirthDateInput";
import { DeptSelect } from "@/components/DeptSelect";
import { brand } from "@/lib/brand";
import { postJson } from "@/lib/api-client";
import { parseBirthDateInput } from "@/lib/birth-date";
import { EXAM_METHOD_LABEL, formatLoginId, type ExamMethod } from "@/lib/no-email";

type Person = {
  user_id: string;
  name: string;
  dept: string | null;
  birth_date: string | null;
  login_id: string;
  issued: boolean;
  confirmed: boolean;
  locked: boolean;
  result: { id: string; method: ExamMethod; at: string; consent: boolean; highStress: boolean } | null;
};
type Slip = { userId: string; name: string; dept: string | null; loginId: string; passcode: string };
type Member = { user_id: string; name: string; dept: string | null };

const mini: React.CSSProperties = {
  background: "#fff",
  color: brand.tealDark,
  border: `1px solid ${brand.teal}`,
  borderRadius: 999,
  padding: "6px 13px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  display: "inline-block",
  lineHeight: 1.4,
};
const miniSolid: React.CSSProperties = { ...mini, background: brand.teal, color: "#fff" };
const miniGray: React.CSSProperties = { ...mini, color: "#8A9694", border: "1px solid #C9D6D4" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", fontSize: 15, border: `1px solid ${brand.line}`, borderRadius: 9, boxSizing: "border-box" };
const jpDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });

// メールアドレスやスマートフォンのない方の受検(実施者・誓約済みの実施事務従事者)。
//   受検の基本はメール(配布URL・QR)。それが難しい方だけ、ここで
//   ① ログインIDと合言葉を紙で渡して、職場の共用端末などから受検してもらう
//   ② 紙の回答用紙に書いてもらい、回答を登録する
export function NoEmailPanel({ companyId, companyName, guideHref }: { companyId: string; companyName: string; guideHref?: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [notReady, setNotReady] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [birthText, setBirthText] = useState("");
  const [dept, setDept] = useState("");
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [showMembers, setShowMembers] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const headers: Record<string, string> = session ? { Authorization: `Bearer ${session.access_token}` } : {};
    const [res, un, { data: ds }] = await Promise.all([
      fetch(`/api/id-accounts?companyId=${encodeURIComponent(companyId)}`, { headers }),
      fetch(`/api/exam/unexamined?companyId=${encodeURIComponent(companyId)}`, { headers }),
      supabase.from("departments").select("name").eq("company_id", companyId).order("sort_order").order("name"),
    ]);
    const json = await res.json().catch(() => ({}));
    if (res.status === 503) return setNotReady(json.error ?? "準備がまだです");
    if (!res.ok) return setErr(json.error ?? "読み込めませんでした");
    setPeople(json.people as Person[]);
    setFiscalYear(json.fiscalYear as number);
    setDepts((ds ?? []).map((d) => d.name as string));
    if (un.ok) setMembers(((await un.json().catch(() => ({}))).members ?? []) as Member[]);
  }, [companyId]);
  useEffect(() => {
    setPeople(null);
    setErr(null);
    setMsg(null);
    load();
  }, [load]);

  const call = async <T,>(body: Record<string, unknown>, url = "/api/id-accounts"): Promise<(T & { error?: string }) | null> => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const { ok, json } = await postJson<T>(url, { companyId, ...body });
    setBusy(false);
    if (!ok) {
      setErr(json.error ?? "処理できませんでした");
      return null;
    }
    return json;
  };

  const birthDate = parseBirthDateInput(birthText);
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErr("氏名を入力してください");
    if (!birthDate) return setErr("生年月日を数字8けた(例: 19850304)で入力してください");
    const r = await call<{ created: { name: string }[]; errors: string[] }>({ action: "create", people: [{ name, birthDate, dept }] });
    if (!r) return;
    if (r.errors.length > 0) setErr(r.errors.join(" / "));
    if (r.created.length > 0) {
      setMsg(`${r.created[0].name}さんを登録しました。下の一覧から「IDの紙を印刷」または「回答用紙を印刷」に進んでください。`);
      setName("");
      setBirthText("");
    }
    load();
  };

  const issue = async (targets: Person[]) => {
    if (targets.length === 0) return;
    const again = targets.filter((t) => t.issued).length;
    const text =
      targets.length === 1
        ? `${targets[0].name}さんのログインIDと合言葉の紙を作ります。${again ? "\n\n前に渡した合言葉は使えなくなります。" : ""}`
        : `${targets.length}名分のログインIDと合言葉の紙を作ります。`;
    if (!window.confirm(`${text}\n\n合言葉はこの1回しか表示されません。続けて印刷してください。`)) return;
    const r = await call<{ slips: Slip[] }>({ action: "issue", userIds: targets.map((t) => t.user_id) });
    if (!r) return;
    setSlips(r.slips);
    load();
  };

  const remove = async (p: Person) => {
    if (!window.confirm(`${p.name}さんの登録を取り消します(ログインIDも使えなくなります)。よろしいですか？`)) return;
    if (await call({ action: "remove", userId: p.user_id })) {
      setMsg(`${p.name}さんの登録を取り消しました。`);
      load();
    }
  };

  const setConsent = async (p: Person, consent: boolean) => {
    if (!p.result) return;
    const q = consent
      ? `${p.name}さんから、結果票を見たあとに書いた「同意書」を受け取りましたか？\n\n記録すると、この方の結果を会社(事業者)の担当者が見られるようになります。`
      : `${p.name}さんの同意を取り消します(会社の担当者は結果を見られなくなります)。よろしいですか？`;
    if (!window.confirm(q)) return;
    if (await call({ resultId: p.result.id, consent }, "/api/paper/consent")) {
      setMsg(consent ? `${p.name}さんの同意を記録しました。同意書は5年間保管してください。` : `${p.name}さんの同意を取り消しました。`);
      load();
    }
  };

  const waiting = useMemo(() => (people ?? []).filter((p) => !p.result), [people]);
  const notIssued = waiting.filter((p) => !p.issued);
  const doneCount = (people ?? []).length - waiting.length;

  if (notReady) {
    return (
      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>メール・スマホのない方の受検</h3>
        <p style={{ fontSize: 13.5, color: "#8A6B2E", margin: 0, lineHeight: 1.8 }}>この機能は準備中です(データベースの設定が済むと使えるようになります)。</p>
      </Card>
    );
  }

  const step = (n: string, title: string, body: React.ReactNode, tone: string) => (
    <div style={{ border: `1px solid ${brand.line}`, borderRadius: 12, padding: "12px 14px", background: tone }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <span style={{ background: brand.tealDark, color: "#fff", borderRadius: 999, minWidth: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{n}</span>
        <strong style={{ fontSize: 14.5, color: brand.ink }}>{title}</strong>
      </div>
      <div style={{ fontSize: 12.5, color: "#44534F", lineHeight: 1.75 }}>{body}</div>
    </div>
  );

  return (
    <>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <h3 style={{ fontSize: 17, color: brand.ink, margin: "0 0 4px" }}>メール・スマホのない方の受検</h3>
          {guideHref && (
            <a href={guideHref} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
              📘 くわしい手順書を開く(印刷できます)
            </a>
          )}
        </div>
        <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.75, margin: "0 0 12px" }}>
          受検の基本は、これまでどおり<strong>メール(配布URL・QRコード)</strong>です。それが難しい方だけ、ここで対応します。どの方法でも、結果は同じように結果一覧・集団分析に入ります。
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10 }}>
          {step("1", "まず、この画面に登録する", <>下の欄に、氏名・生年月日・部署を入れて登録します(メールアドレスは不要)。</>, "#fff")}
          {step(
            "2",
            "職場のパソコン・タブレットなら使える方",
            <>
              <strong>「IDの紙を印刷」</strong>して渡します。本人が共用の端末で、ログインIDと合言葉を入れて受検します。結果もその場で本人が見られます。
            </>,
            "#F4FAF9"
          )}
          {step(
            "3",
            "画面の操作がむずかしい方",
            <>
              <strong>「回答用紙を印刷」</strong>して渡し、封筒で回収します。<strong>「紙の回答を登録」</strong>で入力(写真の読み取りも可)し、結果票を印刷して封筒で返します。
            </>,
            "#FFF9F2"
          )}
        </div>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 10px" }}>受検する方を登録する</h3>
        <form onSubmit={add} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "start" }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink }}>
            氏名
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田 太郎" maxLength={60} style={{ ...input, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink }}>
            生年月日
            <div style={{ marginTop: 4, fontWeight: 400 }}>
              <BirthDateInput text={birthText} onChange={setBirthText} style={input} />
            </div>
          </label>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink }}>
            部署
            <div style={{ marginTop: 4, fontWeight: 400 }}>
              {depts.length > 0 ? <DeptSelect options={depts} value={dept} onChange={setDept} /> : <input type="text" value={dept} onChange={(e) => setDept(e.target.value)} maxLength={100} style={input} />}
            </div>
          </label>
          <div style={{ alignSelf: "end" }}>
            <Btn type="submit" disabled={busy || !name.trim() || !birthDate}>
              登録する
            </Btn>
          </div>
        </form>
        <p style={{ fontSize: 12, color: "#8A9694", margin: "8px 0 0", lineHeight: 1.6 }}>
          生年月日は、IDで最初にログインしたときの本人確認と、同姓同名の方の区別に使います。続けて何人でも登録できます。
        </p>
        {err && <div style={{ fontSize: 13.5, color: "#B02A2A", background: "#FDE3E3", borderRadius: 8, padding: "9px 12px", marginTop: 10, lineHeight: 1.7 }}>{err}</div>}
        {msg && <div style={{ fontSize: 13.5, color: brand.tealDark, background: "#E9F6F4", borderRadius: 8, padding: "9px 12px", marginTop: 10, lineHeight: 1.7 }}>{msg}</div>}
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ fontSize: 16, color: brand.ink, margin: 0 }}>
            登録した方{fiscalYear ? `(${fiscalYear}年度)` : ""}
            {people && people.length > 0 && (
              <span style={{ fontSize: 13, fontWeight: 400, color: "#5B6B6A", marginLeft: 10 }}>
                {people.length}名のうち 受検済み {doneCount}名・これから <strong style={{ color: brand.tealDark }}>{waiting.length}名</strong>
              </span>
            )}
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {notIssued.length > 1 && (
              <button type="button" onClick={() => issue(notIssued.slice(0, 50))} disabled={busy} style={miniSolid}>
                まだ渡していない{Math.min(notIssued.length, 50)}名のIDの紙をまとめて印刷
              </button>
            )}
            <Link href={`/paper-sheet?c=${companyId}`} target="_blank" style={mini}>
              白紙の回答用紙を印刷
            </Link>
          </div>
        </div>
        {!people ? (
          !err && <div style={{ fontSize: 13, color: "#8A9694" }}>読み込んでいます…</div>
        ) : people.length === 0 ? (
          <div style={{ fontSize: 13.5, color: "#5B6B6A", lineHeight: 1.8 }}>まだ登録がありません。上の欄から登録すると、ここに並びます。</div>
        ) : (
          <div>
            {people.map((p) => (
              <div key={p.user_id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "11px 2px", borderTop: `1px solid ${brand.line}` }}>
                <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: brand.ink }}>
                    {p.name}
                    {p.dept && <span style={{ fontSize: 12.5, fontWeight: 400, color: "#5B6B6A", marginLeft: 8 }}>{p.dept}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "#8A9694", marginTop: 2 }}>ログインID {formatLoginId(p.login_id)}</div>
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  {p.result ? (
                    <Badge>
                      受検済み({EXAM_METHOD_LABEL[p.result.method]})　{jpDate(p.result.at)}
                    </Badge>
                  ) : p.locked ? (
                    <Badge tone="red">本人確認で停止中</Badge>
                  ) : p.confirmed ? (
                    <Badge tone="orange">ログイン済み・回答待ち</Badge>
                  ) : p.issued ? (
                    <Badge tone="orange">IDの紙を渡し済み</Badge>
                  ) : (
                    <Badge tone="gray">これから</Badge>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: "0 1 auto", marginLeft: "auto", justifyContent: "flex-end" }}>
                  {p.result ? (
                    <>
                      <Link href={`/report/${p.result.id}`} target="_blank" style={miniSolid}>
                        結果票を印刷
                      </Link>
                      {p.result.method === "paper" &&
                        (p.result.consent ? (
                          <button type="button" onClick={() => setConsent(p, false)} disabled={busy} style={miniGray}>
                            同意あり(取り消す)
                          </button>
                        ) : (
                          <>
                            <Link href={`/paper-sheet?c=${companyId}&u=${p.user_id}&kind=consent`} target="_blank" style={mini}>
                              同意書を印刷
                            </Link>
                            <button type="button" onClick={() => setConsent(p, true)} disabled={busy} style={mini}>
                              同意書を受け取った
                            </button>
                          </>
                        ))}
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => issue([p])} disabled={busy} style={p.issued ? mini : miniSolid}>
                        {p.issued ? "IDの紙を出し直す" : "IDの紙を印刷"}
                      </button>
                      <Link href={`/paper-sheet?c=${companyId}&u=${p.user_id}`} target="_blank" style={mini}>
                        回答用紙を印刷
                      </Link>
                      <Link href={`/paper/${p.user_id}`} style={mini}>
                        紙の回答を登録
                      </Link>
                      <button type="button" onClick={() => remove(p)} disabled={busy} style={miniGray}>
                        取り消し
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>メールで登録済みの方が、紙での回答を希望したとき</h3>
        <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.75, margin: "0 0 8px" }}>
          すでに自分のメールアドレスでアカウントを作った方は、上の登録は不要です。白紙の回答用紙を渡し、回収したら下の一覧から「紙の回答を登録」を押してください。
        </p>
        {members.length === 0 ? (
          <div style={{ fontSize: 13, color: "#8A9694" }}>メールで登録済みで未受検の方は、いまはいません。</div>
        ) : (
          <>
            <button type="button" onClick={() => setShowMembers((v) => !v)} style={mini}>
              {showMembers ? "閉じる" : `メールで登録済み・未受検の${members.length}名を表示`}
            </button>
            {showMembers && (
              <div style={{ marginTop: 8, maxHeight: 320, overflowY: "auto" }}>
                {members.map((m) => (
                  <div key={m.user_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 2px", borderTop: `1px solid ${brand.line}` }}>
                    <div style={{ fontSize: 14, color: brand.ink }}>
                      {m.name}
                      {m.dept && <span style={{ fontSize: 12.5, color: "#5B6B6A", marginLeft: 8 }}>{m.dept}</span>}
                    </div>
                    <Link href={`/paper/${m.user_id}`} style={mini}>
                      紙の回答を登録
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {slips && <SlipSheet slips={slips} companyName={companyName} fiscalYear={fiscalYear} onClose={() => setSlips(null)} />}
    </>
  );
}

const SLIP_CSS = `
        .slip { width: 210mm; height: 148.4mm; box-sizing: border-box; padding: 12mm 16mm 10mm; background: #fff; color: #111; font-family: 'Meiryo','Hiragino Sans','Yu Gothic',sans-serif; position: relative; margin: 0 auto; border-bottom: 1px dashed #888; }
        .slip h2 { font-size: 15pt; margin: 0; }
        .slip-key { border: 2px solid #111; border-radius: 3mm; padding: 3mm 5mm; display: flex; gap: 8mm; align-items: center; margin: 4mm 0 3mm; }
        .slip-key div { font-size: 9.5pt; }
        .slip-key b { display: block; font-size: 22pt; letter-spacing: .12em; font-family: 'Consolas','Menlo',monospace; line-height: 1.25; }
        .slip ol { margin: 0; padding-left: 5.5mm; font-size: 10.5pt; line-height: 1.8; }
        @media print {
          body > *:not(.slip-root) { display: none !important; }
          body { background: #fff !important; }
          .slip-root { position: static !important; background: #fff !important; padding: 0 !important; overflow: visible !important; }
          .slip-bar { display: none !important; }
          .slip { break-inside: avoid; page-break-inside: avoid; }
          .slip:nth-of-type(2n) { break-after: page; page-break-after: always; border-bottom: 0; }
          .slip:last-of-type { break-after: auto; page-break-after: auto; }
        }
        @page { size: A4; margin: 0; }
      `;

// ログインIDと合言葉の紙(A4に2名分。切り取って渡す)。画面いっぱいに重ねて出し、印刷ではこの紙だけを出す
export function SlipSheet({ slips, companyName, fiscalYear, onClose }: { slips: Slip[]; companyName: string; fiscalYear: number | null; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [printed, setPrinted] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/login?mode=id`;
  const shortUrl = url.replace(/^https?:\/\//, "");
  useEffect(() => {
    setMounted(true);
    QRCode.toDataURL(`${window.location.origin}/login?mode=id`, { width: 260, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  if (!mounted) return null;

  const close = () => {
    if (window.confirm(printed ? "閉じます。合言葉はもう表示できません(忘れたときは「IDの紙を出し直す」)。" : "まだ印刷していません。閉じると、合言葉はもう表示できません。閉じますか？")) onClose();
  };

  return createPortal(
    <div className="slip-root" style={{ position: "fixed", inset: 0, background: "rgba(34,51,59,.55)", zIndex: 1000, overflowY: "auto", padding: "16px 8px 40px" }}>
      <style dangerouslySetInnerHTML={{ __html: SLIP_CSS }} />
      <div className="slip-bar" style={{ maxWidth: 794, margin: "0 auto 12px", background: "#fff", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ fontSize: 13.5, color: brand.ink, lineHeight: 1.7, flex: "1 1 300px" }}>
          <strong>{slips.length}名分のIDの紙</strong>ができました。<strong style={{ color: "#B02A2A" }}>合言葉はいましか表示されません。</strong>
          印刷して点線で切り、ご本人だけに渡してください(封筒に入れると安心です)。
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn
            onClick={() => {
              setPrinted(true);
              window.print();
            }}
          >
            印刷する
          </Btn>
          <Btn tone="ghost" onClick={close}>
            閉じる
          </Btn>
        </div>
      </div>
      {slips.map((s) => (
        <div className="slip" key={s.userId}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "2px solid #111", paddingBottom: "2mm" }}>
            <div>
              <h2>ストレスチェック 受検のご案内</h2>
              <div style={{ fontSize: "9.5pt" }}>
                {companyName} {fiscalYear ? `${fiscalYear}年度` : ""}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: "13pt", fontWeight: 700 }}>
              {s.name} さん
              {s.dept && <div style={{ fontSize: "9pt", fontWeight: 400 }}>{s.dept}</div>}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6mm", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div className="slip-key">
                <div>
                  ログインID
                  <b>{formatLoginId(s.loginId)}</b>
                </div>
                <div>
                  合言葉
                  <b>{s.passcode}</b>
                </div>
              </div>
              <ol>
                <li>
                  職場のパソコンやタブレットで <strong>{shortUrl}</strong> を開きます(右のQRコードからも開けます)。
                </li>
                <li>
                  「<strong>ログインIDで</strong>」を選び、上のログインIDと合言葉を入れます(合言葉は英字4つ+数字4つ)。
                </li>
                <li>最初に、ご本人の確認のため<strong>生年月日</strong>を入れます。</li>
                <li>質問に答えます(約10〜15分)。終わると、その場で結果が表示されます。</li>
                <li>
                  終わったら、かならず右上の「<strong>ログアウト</strong>」を押してください。
                </li>
              </ol>
            </div>
            <div style={{ width: "34mm", textAlign: "center", marginTop: "4mm" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {qr && <img src={qr} alt="ログイン画面のQRコード" style={{ width: "34mm", height: "34mm" }} />}
              <div style={{ fontSize: "8pt" }}>ログイン画面</div>
            </div>
          </div>
          <div style={{ position: "absolute", left: "16mm", right: "16mm", bottom: "7mm", fontSize: "8.5pt", lineHeight: 1.6, borderTop: "1px solid #999", paddingTop: "1.5mm" }}>
            この紙は、ほかの人に見せたり渡したりしないでください。あなたの結果は、あなたの同意がない限り会社には伝わりません。
            合言葉を忘れたとき・うまく入れないときは、実施事務従事者(ストレスチェックの担当者)に声をかけてください。
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}
