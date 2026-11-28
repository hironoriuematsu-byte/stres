"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { BirthDateInput } from "@/components/BirthDateInput";
import { parseBirthDateInput } from "@/lib/birth-date";
import { postJson } from "@/lib/api-client";
import { startNavigationProgress } from "@/lib/navigate";

const LOCKED_TEXT = "確認に続けて失敗したため、利用を止めています。会社のストレスチェック担当者に、合言葉の出し直しを依頼してください。";

// 最初のログインのときだけ、生年月日でご本人であることを確かめる
export function ConfirmIdForm({ name, next, locked: lockedInit }: { name: string; next: string; locked: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(lockedInit);
  const [err, setErr] = useState<string | null>(lockedInit ? LOCKED_TEXT : null);
  const birthDate = parseBirthDateInput(text);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!birthDate) return;
    setBusy(true);
    setErr(null);
    const { ok, json } = await postJson<{ locked?: boolean }>("/api/id-accounts/confirm", { birthDate });
    setBusy(false);
    if (!ok) {
      if (json.locked) setLocked(true);
      return setErr(json.error ?? "確認できませんでした");
    }
    startNavigationProgress();
    router.push(next);
    router.refresh();
  };

  return (
    <Card style={{ maxWidth: 460, margin: "0 auto" }}>
      <h2 style={{ fontSize: 20, color: brand.ink, margin: "0 0 8px" }}>ご本人の確認</h2>
      <p style={{ fontSize: 14, color: "#2C3B39", lineHeight: 1.8, margin: "0 0 14px" }}>
        {name && name !== "未設定" ? <strong>{name} さん</strong> : "ご本人"}であることを確かめるため、<strong>生年月日</strong>を入力してください(最初の1回だけです)。
      </p>
      <form onSubmit={submit}>
        <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>生年月日(数字8けた)</label>
        <BirthDateInput
          text={text}
          onChange={setText}
          style={{ width: "100%", boxSizing: "border-box", padding: "12px 12px", fontSize: 18, border: `1px solid ${brand.line}`, borderRadius: 10 }}
        />
        {err && (
          <div style={{ fontSize: 13.5, color: "#B02A2A", background: "#FDF0F0", border: "1px solid #F3CBCB", borderRadius: 10, padding: "10px 12px", marginTop: 10, lineHeight: 1.7 }}>
            {err}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <Btn type="submit" disabled={busy || locked || !birthDate}>
            {busy ? "確認しています…" : "確認して進む"}
          </Btn>
        </div>
      </form>
      <p style={{ fontSize: 12, color: "#7A8886", lineHeight: 1.7, margin: "14px 0 0" }}>
        氏名がご自身のものでない場合は入力せず、会社のストレスチェック担当者にお知らせください。
      </p>
    </Card>
  );
}
