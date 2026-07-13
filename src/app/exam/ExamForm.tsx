"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card, QuestionRow, ScoreBar } from "@/components/ui";
import { brand } from "@/lib/brand";
import { SECTION_A, SECTION_B, SECTION_C, SECTION_D, Answers, Scores, calcScores, emptyAnswers } from "@/lib/questionnaire";
import { getFiscalYear } from "@/lib/fiscal";

type ExamProfile = {
  userId: string;
  name: string;
  empId: string;
  dept: string;
  companyId: string;
  companyName: string;
};

const sections = { 1: SECTION_A, 2: SECTION_B, 4: SECTION_D } as const;

export function ExamForm({ profile }: { profile: ExamProfile }) {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0=受検者情報 1=A 2=B 3=C 4=D 5=同意 6=結果 7=年度重複
  const [name, setName] = useState(profile.name);
  const [empId, setEmpId] = useState(profile.empId);
  const [dept, setDept] = useState(profile.dept);
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [resultId, setResultId] = useState<string | null>(null);
  const [ans, setAns] = useState<Answers>(emptyAnswers());
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Scores | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fiscalYear = getFiscalYear(); // 受検は常に現在の年度で記録する

  // 共有PC対策: 受検終了後にその場でログアウトできるようにする
  const signOutAndExit = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  const setAnswer = (sec: keyof Answers, idx: number, v: number) => {
    setAns((p) => {
      const n = { ...p, [sec]: [...p[sec]] };
      n[sec][idx] = v;
      return n;
    });
  };

  const complete = (sec: keyof Answers) => ans[sec].every((v) => v != null);

  const submit = async () => {
    setSaving(true);
    setSaveError(null);
    const scores = calcScores(ans);
    const supabase = createClient();

    // 本人が入力した氏名・社員番号・部署をプロフィールへ反映
    // (失敗しても受検自体は続行する)
    await supabase
      .from("profiles")
      .update({ name, emp_id: empId, dept })
      .eq("user_id", profile.userId);

    const { data: inserted, error } = await supabase
      .from("results")
      .insert({
        user_id: profile.userId,
        company_id: profile.companyId,
        dept: dept || "未記入",
        fiscal_year: fiscalYear,
        answers: ans,
        gender: gender || null,
        score_a: scores.A,
        score_b: scores.B,
        score_c: scores.C,
        score_d: scores.D,
        high_stress: scores.highStress,
        consent,
      })
      .select("id")
      .single();
    if (inserted) setResultId(inserted.id);

    setSaving(false);

    if (error) {
      // 同一年度の重複受検(unique制約違反)
      if (error.code === "23505") {
        setStep(7);
        return;
      }
      setSaveError(error.message);
      return;
    }

    setResult(scores);
    setStep(6);
  };

  // 受検者情報(本人入力)
  if (step === 0) {
    const input = {
      width: "100%",
      boxSizing: "border-box" as const,
      padding: "10px 12px",
      fontSize: 15,
      border: `1px solid ${brand.line}`,
      borderRadius: 10,
    };
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto" }}>
        <Badge>STEP 1 / 6</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 4px" }}>受検者情報</h2>
        <p style={{ fontSize: 13, color: "#5B6B6A", marginBottom: 14 }}>
          ストレスチェックを開始します。氏名・社員番号・部署を入力してください。
        </p>
        <div
          style={{
            fontSize: 14,
            color: brand.ink,
            background: "#EDF6F5",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <strong>会社名:</strong> {profile.companyName || "(未登録)"}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            氏名
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田 太郎" style={input} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            社員番号
          </label>
          <input value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="例: 10234" style={input} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            部署
          </label>
          <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="例: 製造部" style={input} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
            性別(結果票の素点換算に使用します)
          </label>
          <div style={{ display: "flex", gap: 16, fontSize: 14, color: brand.ink }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" name="gender" checked={gender === "male"} onChange={() => setGender("male")} />
              男性
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" name="gender" checked={gender === "female"} onChange={() => setGender("female")} />
              女性
            </label>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Btn tone="ghost" onClick={() => router.push("/my")}>
            戻る
          </Btn>
          <Btn onClick={() => setStep(1)} disabled={!name || !empId || !dept || !gender}>
            回答をはじめる
          </Btn>
        </div>
      </Card>
    );
  }

  // A / B / D セクション
  if (step === 1 || step === 2 || step === 4) {
    const sec = sections[step as 1 | 2 | 4];
    const answered = ans[sec.key].filter((v) => v != null).length;
    return (
      <Card style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Badge>STEP {step + 1} / 6</Badge>
          <span style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>
            {answered} / {sec.items.length} 回答済
          </span>
        </div>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 2px" }}>{sec.title}</h2>
        <p style={{ fontSize: 13, color: "#5B6B6A", marginBottom: 8 }}>{sec.lead}</p>
        {sec.items.map((q, i) => (
          <QuestionRow
            key={i}
            num={i + 1}
            text={q.t}
            options={sec.options}
            value={ans[sec.key][i]}
            onChange={(v) => setAnswer(sec.key, i, v)}
          />
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Btn tone="ghost" onClick={() => setStep(step - 1)}>
            戻る
          </Btn>
          <Btn onClick={() => setStep(step + 1)} disabled={!complete(sec.key)}>
            次へ
          </Btn>
        </div>
      </Card>
    );
  }

  // C セクション(グループ構造)
  if (step === 3) {
    const answered = ans.C.filter((v) => v != null).length;
    let idx = 0;
    return (
      <Card style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Badge>STEP 4 / 6</Badge>
          <span style={{ fontSize: 13, color: brand.tealDark, fontWeight: 700 }}>{answered} / 9 回答済</span>
        </div>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 2px" }}>{SECTION_C.title}</h2>
        <p style={{ fontSize: 13, color: "#5B6B6A", marginBottom: 8 }}>{SECTION_C.lead}</p>
        {SECTION_C.groups.map((g, gi) => (
          <div key={gi} style={{ marginTop: 18 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: brand.tealDark,
                background: "#EDF6F5",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              {g.label}
            </div>
            {g.items.map((t) => {
              const i = idx++;
              return (
                <QuestionRow key={i} num={i + 1} text={t} options={SECTION_C.options} value={ans.C[i]} onChange={(v) => setAnswer("C", i, v)} />
              );
            })}
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Btn tone="ghost" onClick={() => setStep(2)}>
            戻る
          </Btn>
          <Btn onClick={() => setStep(4)} disabled={!complete("C")}>
            次へ
          </Btn>
        </div>
      </Card>
    );
  }

  // 同意
  if (step === 5) {
    return (
      <Card style={{ maxWidth: 620, margin: "0 auto" }}>
        <Badge>STEP 6 / 6</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 8px" }}>結果の取り扱いについて</h2>
        <ul style={{ fontSize: 14, color: "#44534F", lineHeight: 1.9, paddingLeft: 20, margin: "0 0 16px" }}>
          <li>あなたの結果は、あなた本人・実施者(産業医事務所)・実施事務従事者が確認します。</li>
          <li>会社(事業者担当者)には、あなたの同意がない限り個人結果は提供されません(労働安全衛生法第66条の10)。</li>
          <li>同意はあとから結果画面でいつでも追加・撤回できます。</li>
          <li>同意の有無にかかわらず、個人が特定されない集団分析(10名以上の部署のみ)には利用されます。</li>
          <li>高ストレスと判定された場合、このシステムから産業医面接指導の申出ができます。</li>
        </ul>
        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            background: "#F4FAF9",
            border: `1px solid ${brand.line}`,
            borderRadius: 10,
            padding: 14,
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 14, color: brand.ink, lineHeight: 1.7 }}>
            私のストレスチェック結果(個人結果)を会社の担当者へ提供することに<strong>同意します</strong>
            (任意・チェックなしでも受検結果は有効です)
          </span>
        </label>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Btn tone="ghost" onClick={() => setStep(4)}>
            戻る
          </Btn>
          <Btn onClick={submit} disabled={saving}>
            {saving ? "送信中…" : "結果を確定する"}
          </Btn>
        </div>
        {saveError && (
          <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 12 }}>保存に失敗しました: {saveError}</div>
        )}
      </Card>
    );
  }

  // 結果
  if (step === 6 && result) {
    return (
      <Card style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          {result.highStress ? <Badge tone="red">高ストレス判定</Badge> : <Badge>判定: 高ストレスに該当せず</Badge>}
          <h2 style={{ fontSize: 22, color: brand.ink, margin: "12px 0 4px" }}>{name} さんの結果</h2>
          <p style={{ fontSize: 13, color: "#5B6B6A" }}>
            {profile.companyName} / {fiscalYear}年度 / {new Date().toLocaleDateString("ja-JP")} 実施 / 合計点数法による判定
          </p>
        </div>
        <ScoreBar label="A. 仕事のストレス要因" value={result.A} max={68} />
        <ScoreBar label="B. 心身のストレス反応" value={result.B} max={116} threshold={77} />
        <ScoreBar label="C. 周囲のサポート(点が高いほど乏しい)" value={result.C} max={36} />
        <div
          style={{
            fontSize: 13,
            color: "#5B6B6A",
            background: "#F4FAF9",
            borderRadius: 10,
            padding: "10px 14px",
            lineHeight: 1.8,
            marginTop: 8,
          }}
        >
          高ストレス判定基準: ①B合計77点以上、または ②A+C合計76点以上かつB合計63点以上(あなたのA+C: {result.AC}点)
        </div>
        {result.highStress && (
          <div
            style={{
              fontSize: 14,
              color: "#B02A2A",
              background: "#FDF0F0",
              border: "1px solid #F3CBCB",
              borderRadius: 10,
              padding: "12px 16px",
              lineHeight: 1.8,
              marginTop: 12,
            }}
          >
            高ストレス状態にあると判定されました。医師(産業医)による面接指導の対象です。マイページから面接指導の申出ができます。申出を理由とする不利益取り扱いは法律で禁止されています。
          </div>
        )}
        <div style={{ marginTop: 20, textAlign: "center", display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {resultId && (
            <Link href={`/report/${resultId}`}>
              <Btn tone="ghost">結果票を見る(印刷・PDF)</Btn>
            </Link>
          )}
          {result.highStress && (
            <Link href="/my?interview=1">
              <Btn tone="orange">面接指導を申し出る</Btn>
            </Link>
          )}
          <Link href="/my">
            <Btn>マイページへ</Btn>
          </Link>
          <Btn tone="ghost" onClick={signOutAndExit}>
            ログアウトして終了
          </Btn>
        </div>
        <p style={{ fontSize: 12, color: "#8A9694", marginTop: 14, textAlign: "center", lineHeight: 1.7 }}>
          共用のパソコンをお使いの場合は、終了時に必ず「ログアウトして終了」を押してください。
        </p>
      </Card>
    );
  }

  // 年度重複
  if (step === 7) {
    return (
      <Card style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
        <Badge tone="orange">受検済み</Badge>
        <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 8px" }}>本年度は受検済みです</h2>
        <p style={{ fontSize: 14, color: "#5B6B6A", lineHeight: 1.8, marginBottom: 16 }}>
          {fiscalYear}年度のストレスチェックはすでに実施済みのため、再受検はできません。結果はマイページから確認できます。
        </p>
        <Link href="/my">
          <Btn>マイページへ</Btn>
        </Link>
      </Card>
    );
  }

  return null;
}
