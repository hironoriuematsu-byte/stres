"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Btn, Card } from "@/components/ui";
import { DeptSelect } from "@/components/DeptSelect";
import { brand } from "@/lib/brand";
import { postJson } from "@/lib/api-client";
import { emptyFlat, flatMissing, paperCount, paperSections, validChoice, type FlatAnswers } from "@/lib/paper";

type Pick = { name: string; mediaType: string; data: string };

// 写真は送る前に小さくする(長い辺 1800px・JPEG)。スマホの写真は1枚 数MB あり、そのままでは送れないため
async function shrinkImage(file: File): Promise<Pick> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("画像を開けませんでした"));
      el.src = url;
    });
    const scale = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("画像を処理できませんでした");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { name: file.name, mediaType: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] ?? "" };
  } finally {
    URL.revokeObjectURL(url);
  }
}
const readPdf = (file: File): Promise<Pick> =>
  new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve({ name: file.name, mediaType: "application/pdf", data: String(fr.result).split(",")[1] ?? "" });
    fr.onerror = () => reject(new Error("PDFを開けませんでした"));
    fr.readAsDataURL(file);
  });

export function PaperEntry({
  companyId,
  companyName,
  questionnaire,
  fiscalYear,
  userId,
  name,
  initialDept,
  depts,
  aiReady,
  backHref,
}: {
  companyId: string;
  companyName: string;
  questionnaire: "57" | "80";
  fiscalYear: number;
  userId: string;
  name: string;
  initialDept: string;
  depts: string[];
  aiReady: boolean;
  backHref: string;
}) {
  const sections = useMemo(() => paperSections(questionnaire), [questionnaire]);
  const total = paperCount(questionnaire);
  const [flat, setFlat] = useState<FlatAnswers>(() => emptyFlat(questionnaire));
  const [unsure, setUnsure] = useState<Set<number>>(new Set());
  const [cur, setCur] = useState(1); // いま入力している設問(キーボードの 1〜4 で入る)
  const [dept, setDept] = useState(initialDept);
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [files, setFiles] = useState<Pick[]>([]);
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [done, setDone] = useState<{ resultId: string; highStress: boolean } | null>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const filled = flat.filter(validChoice).length;
  const missing = flatMissing(flat, questionnaire);

  const setAnswer = (no: number, v: number) => {
    setFlat((f) => f.map((x, i) => (i === no - 1 ? v : x)));
    setUnsure((u) => {
      if (!u.has(no)) return u;
      const n = new Set(u);
      n.delete(no);
      return n;
    });
  };
  const go = (no: number) => {
    const n = Math.max(1, Math.min(total, no));
    setCur(n);
    rowRefs.current[n]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  // キーボード: 1〜4 で回答して次へ、0 で空にして次へ、↑↓ で移動、BackSpace で1つ戻る
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.normalize("NFKC");
      if (["1", "2", "3", "4"].includes(k)) {
        e.preventDefault();
        setAnswer(cur, Number(k));
        go(cur + 1);
      } else if (k === "0") {
        e.preventDefault();
        setAnswer(cur, 0);
        go(cur + 1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        go(cur + 1);
      } else if (e.key === "ArrowUp" || e.key === "Backspace") {
        e.preventDefault();
        go(cur - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, done, total]);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setErr(null);
    setReadMsg(null);
    try {
      const added: Pick[] = [];
      for (const f of Array.from(list)) {
        if (f.type === "application/pdf") added.push(await readPdf(f));
        else if (f.type.startsWith("image/")) added.push(await shrinkImage(f));
        else throw new Error("写真(JPEG・PNG)かPDFを選んでください");
      }
      const next = [...files, ...added].slice(0, 4);
      if (next.reduce((s, f) => s + f.data.length, 0) > 3_600_000) throw new Error("ファイルが大きすぎます。枚数を減らすか、1ページずつ読み取ってください。");
      setFiles(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ファイルを開けませんでした");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const readByAi = async () => {
    if (files.length === 0) return;
    setReading(true);
    setErr(null);
    setReadMsg(null);
    const { ok, json } = await postJson<{ flat?: number[]; unsure?: number[]; read?: number }>("/api/paper/read", {
      companyId,
      questionnaire,
      files: files.map((f) => ({ mediaType: f.mediaType, data: f.data })),
    });
    setReading(false);
    if (!ok || !json.flat) return setErr(json.error ?? "読み取れませんでした");
    // 読み取れた設問だけを入れる(すでに入力してある設問で、読み取れなかったものは残す)
    const got = json.flat;
    setFlat((f) => f.map((x, i) => (validChoice(got[i]) ? got[i] : x)));
    const us = new Set(json.unsure ?? []);
    setUnsure(us);
    setFiles([]);
    setShowCheck(true);
    setReadMsg(`${json.read ?? 0}問を読み取りました。${us.size > 0 ? `黄色の${us.size}問は読み取りに自信がありません。` : ""}かならず用紙と見比べて、ちがうところを直してから登録してください。`);
    const firstCheck = got.findIndex((v, i) => !validChoice(v) || us.has(i + 1));
    if (firstCheck >= 0) go(firstCheck + 1);
  };

  const submit = async () => {
    setShowCheck(true);
    setErr(null);
    if (missing.length > 0) {
      go(missing[0]);
      return setErr(`回答が入っていない設問が${missing.length}問あります(赤い行)。用紙でも空欄のときは、ご本人に書いてもらってください。`);
    }
    if (!gender) return setErr("性別を選んでください(表紙に書いてあります)");
    if (!dept.trim()) return setErr("部署を入力してください");
    if (!window.confirm(`${name}さんの紙の回答を登録します。\n登録すると結果が確定し、結果一覧・集団分析に反映されます。用紙と見比べましたか？`)) return;
    setSaving(true);
    const { ok, json } = await postJson<{ resultId?: string; highStress?: boolean }>("/api/paper/submit", { companyId, userId, flat, dept: dept.trim(), gender });
    setSaving(false);
    if (!ok || !json.resultId) return setErr(json.error ?? "登録できませんでした");
    setDone({ resultId: json.resultId, highStress: Boolean(json.highStress) });
    window.scrollTo({ top: 0 });
  };

  if (done) {
    return (
      <Card style={{ maxWidth: 620, margin: "0 auto" }}>
        <Badge>登録しました</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 8px" }}>{name}さんの結果を登録しました</h2>
        <ol style={{ fontSize: 14, color: "#44534F", lineHeight: 2, paddingLeft: 22, margin: "0 0 14px" }}>
          <li>
            <strong>結果票を印刷</strong>して、封筒に入れて封をし、ご本人に渡してください(結果の通知)。
          </li>
          <li>会社への結果の提供に同意するかどうかは、結果票と一緒に<strong>同意書</strong>を渡して、あとで受け取ります(任意)。</li>
          <li>書いてもらった回答用紙は、結果と同じく5年間、鍵のかかる場所で保管してください。</li>
        </ol>
        {done.highStress && (
          <div style={{ background: "#FFF6EC", border: "1px solid #F1D2B4", borderRadius: 10, padding: 12, fontSize: 13.5, color: "#7A4A16", lineHeight: 1.8, marginBottom: 14 }}>
            この方は<strong>高ストレス</strong>と判定されました。結果票に面接指導の案内が出ます。画面から申し出ができない方なので、
            希望される場合は実施事務従事者が聞き取り、産業医事務所にご連絡ください。
          </div>
        )}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href={`/report/${done.resultId}`} target="_blank">
            <Btn>結果票を開く(印刷)</Btn>
          </Link>
          <Link href={`/paper-sheet?c=${companyId}&u=${userId}&kind=consent`} target="_blank">
            <Btn tone="ghost">同意書を印刷</Btn>
          </Link>
          <Link href={backHref}>
            <Btn tone="ghost">ダッシュボードへ戻る</Btn>
          </Link>
        </div>
      </Card>
    );
  }

  const chip = (active: boolean): React.CSSProperties => ({
    width: 40,
    height: 34,
    borderRadius: 8,
    border: `1.5px solid ${active ? brand.teal : "#C9D6D4"}`,
    background: active ? brand.teal : "#fff",
    color: active ? "#fff" : brand.ink,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
  });

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 14 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <Badge tone="orange">紙の回答の登録</Badge>
            <h2 style={{ fontSize: 22, color: brand.ink, margin: "10px 0 2px" }}>{name || "(氏名未登録)"}さん</h2>
            <div style={{ fontSize: 13, color: "#5B6B6A" }}>
              {companyName} {fiscalYear}年度・{total}問
            </div>
          </div>
          <Link href={backHref} style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
            ← 登録せずに戻る
          </Link>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginTop: 14 }}>
          <label style={{ fontSize: 13, color: brand.ink, fontWeight: 700 }}>
            部署
            <div style={{ marginTop: 4, fontWeight: 400 }}>
              {depts.length > 0 ? (
                <DeptSelect options={depts} value={dept} onChange={setDept} />
              ) : (
                <input type="text" value={dept} onChange={(e) => setDept(e.target.value)} maxLength={100} style={{ width: "100%", padding: "10px 12px", fontSize: 15, border: `1px solid ${brand.line}`, borderRadius: 9, boxSizing: "border-box" }} />
              )}
            </div>
          </label>
          <div style={{ fontSize: 13, color: brand.ink, fontWeight: 700 }}>
            性別(表紙に書いてあるもの)
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {(
                [
                  ["male", "男"],
                  ["female", "女"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" onClick={() => setGender(v)} style={{ ...chip(gender === v), width: 76, height: 40, fontSize: 15 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 6px" }}>① 写真・スキャンから読み取る(任意)</h3>
        {aiReady ? (
          <>
            <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.75, margin: "0 0 10px" }}>
              <strong>回答のページだけ</strong>(氏名のある表紙は除く)を、スマホで撮るかスキャンして選ぶと、AIが○の付いた番号を読み取って下の表に入れます。
              1ページずつ、まっすぐ・明るく・全体が写るように撮ってください。読み取りはあくまで下書きです。<strong>かならず用紙と見比べてから登録</strong>してください。
              <br />
              <span style={{ fontSize: 12 }}>写真は読み取りにだけ使い、保存しません。読み取り1回ごとにAIの利用料(1人あたり10円前後)がかかります。</span>
            </p>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(e) => addFiles(e.target.files)} style={{ display: "none" }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Btn tone="ghost" onClick={() => fileRef.current?.click()} disabled={reading || files.length >= 4}>
                写真・PDFを選ぶ
              </Btn>
              {files.length > 0 && (
                <>
                  <span style={{ fontSize: 13, color: brand.ink }}>
                    {files.length}枚: {files.map((f) => f.name).join("、")}
                  </span>
                  <button type="button" onClick={() => setFiles([])} disabled={reading} style={{ background: "none", border: 0, color: "#8A9694", fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}>
                    選び直す
                  </button>
                  <Btn onClick={readByAi} disabled={reading}>
                    {reading ? "読み取っています…(30秒ほど)" : "AIで読み取る"}
                  </Btn>
                </>
              )}
            </div>
            {readMsg && <div style={{ fontSize: 13.5, color: brand.tealDark, marginTop: 10, lineHeight: 1.7, fontWeight: 700 }}>{readMsg}</div>}
          </>
        ) : (
          <p style={{ fontSize: 13, color: "#8A6B2E", margin: 0 }}>AIの読み取りは準備中です。下の表に手で入力してください。</p>
        )}
      </Card>

      <Card style={{ padding: "20px 16px" }}>
        <div style={{ position: "sticky", top: 0, background: "#fff", zIndex: 2, paddingBottom: 8, borderBottom: `1px solid ${brand.line}`, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 16, color: brand.ink, margin: 0 }}>② 回答を入力・確認する</h3>
            <div style={{ fontSize: 14, fontWeight: 700, color: filled === total ? brand.tealDark : "#B45415" }}>
              入力済み {filled} / {total}問
              {missing.length > 0 && showCheck && (
                <button type="button" onClick={() => go(missing[0])} style={{ marginLeft: 10, background: "none", border: 0, color: "#B02A2A", fontSize: 12.5, fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>
                  空欄へ移動
                </button>
              )}
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: "#5B6B6A", marginTop: 4, lineHeight: 1.6 }}>
            キーボードの <kbd>1</kbd>〜<kbd>4</kbd> を押すと、枠の付いた設問に入って次へ進みます(<kbd>↑</kbd>
            <kbd>↓</kbd> で移動)。用紙を上から順に見ながら、番号だけを打てます。
          </div>
        </div>

        {sections.map((sec) => (
          <div key={sec.key} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: "8px 4px 6px", borderBottom: `2px solid ${brand.teal}` }}>
              <div style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: brand.ink }}>{sec.title}</div>
              <div style={{ fontSize: 11, color: "#5B6B6A", textAlign: "right", lineHeight: 1.5 }}>
                {sec.options.map((o, i) => (
                  <span key={i} style={{ marginLeft: 8, whiteSpace: "nowrap" }}>
                    <strong>{i + 1}</strong> {o}
                  </span>
                ))}
              </div>
            </div>
            {sec.items.map((it, idx) => {
              const v = flat[it.no - 1];
              const isCur = cur === it.no;
              const isMissing = showCheck && !validChoice(v);
              const isUnsure = unsure.has(it.no);
              const newGroup = it.group && it.group !== sec.items[idx - 1]?.group;
              return (
                <div key={it.no}>
                  {newGroup && <div style={{ fontSize: 12.5, fontWeight: 700, color: "#5B6B6A", padding: "8px 4px 2px" }}>{it.group}</div>}
                  <div
                    ref={(el) => {
                      rowRefs.current[it.no] = el;
                    }}
                    onClick={() => setCur(it.no)}
                    data-no={it.no}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 4px",
                      borderBottom: "1px solid #EEF1F1",
                      background: isMissing ? "#FDECEC" : isUnsure ? "#FFF7D6" : isCur ? "#F1FAF9" : undefined,
                      outline: isCur ? `2px solid ${brand.teal}` : "none",
                      outlineOffset: -2,
                      borderRadius: isCur ? 8 : 0,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ width: 28, textAlign: "right", fontSize: 14, fontWeight: 700, color: brand.ink, flexShrink: 0 }}>{it.no}</div>
                    <div style={{ flex: 1, fontSize: 13.5, color: "#44534F", lineHeight: 1.5, minWidth: 0 }}>
                      {it.text}
                      {isUnsure && <span style={{ marginLeft: 6, fontSize: 11.5, color: "#8A6B2E", fontWeight: 700 }}>要確認</span>}
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`設問${it.no} ${n}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setCur(it.no);
                            setAnswer(it.no, v === n ? 0 : n);
                          }}
                          style={chip(v === n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {err && <div style={{ fontSize: 13.5, color: "#B02A2A", background: "#FDE3E3", borderRadius: 8, padding: "9px 12px", marginBottom: 12, lineHeight: 1.7 }}>{err}</div>}
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Btn tone="orange" onClick={submit} disabled={saving}>
            {saving ? "登録しています…" : "③ この内容で結果を登録する"}
          </Btn>
          <span style={{ fontSize: 12.5, color: "#5B6B6A" }}>登録すると、Webで受検したときと同じ計算で結果が出ます。</span>
        </div>
      </Card>
    </div>
  );
}
