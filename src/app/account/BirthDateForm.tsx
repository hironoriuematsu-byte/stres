"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { birthDateInputValue, birthTextError, parseBirthDateInput } from "@/lib/birth-date";
import { BirthDateInput } from "@/components/BirthDateInput";
import { saveBirthDate } from "@/lib/birth-date-db";

// 生年月日の登録・変更(健康管理Webで健診結果・カルテと本人を突合するために使う)
export function BirthDateForm({ userId, initial }: { userId: string; initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(birthDateInputValue(initial)); // 直接入力(19850304 など)
  const value = parseBirthDateInput(text) ?? "";
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setNotice(null);
    const v = birthTextError(text);
    if (v) {
      setErr(v);
      return;
    }
    setBusy(true);
    try {
      const ok = await saveBirthDate(createClient(), userId, value);
      setNotice(ok ? "生年月日を保存しました。" : "現在は保存できません(システム側の準備中)。");
      router.refresh();
    } catch (e) {
      setErr("保存に失敗しました: " + (e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Card>
      <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>生年月日</h3>
      <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 12px" }}>
        健康診断の結果や面談の記録と本人を正しく結び付けるために使います(同姓同名の方の区別)。
        {!initial && <strong style={{ color: "#B02A2A" }}>まだ登録されていません。</strong>}
      </p>
      <form onSubmit={submit}>
        <div style={{ marginBottom: 12 }}>
          <BirthDateInput
            text={text}
            onChange={setText}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              fontSize: 15,
              border: `1px solid ${brand.line}`,
              borderRadius: 10,
            }}
          />
        </div>
        {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 10 }}>{err}</div>}
        {notice && (
          <div style={{ fontSize: 13, color: brand.tealDark, background: "#E2F3F1", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
            {notice}
          </div>
        )}
        <Btn type="submit" disabled={busy || value === initial}>
          {busy ? "保存中…" : "生年月日を保存する"}
        </Btn>
      </form>
    </Card>
  );
}
