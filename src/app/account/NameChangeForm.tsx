"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

export function NameChangeForm({ userId, initialName }: { userId: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName === "未設定" ? "" : initialName);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setNotice(null);
    if (!name.trim()) {
      setErr("氏名を入力してください。");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim() })
      .eq("user_id", userId);
    setBusy(false);
    if (error) {
      setErr("変更に失敗しました: " + error.message);
      return;
    }
    setNotice("氏名を変更しました。");
    router.refresh();
  };

  return (
    <Card>
      <h3 style={{ fontSize: 16, color: brand.ink, margin: "0 0 8px" }}>氏名の変更</h3>
      <p style={{ fontSize: 13, color: "#5B6B6A", lineHeight: 1.7, margin: "0 0 12px" }}>
        画面やアクセスログ(操作記録)に表示される氏名です。
        {initialName === "未設定" && (
          <strong style={{ color: "#B02A2A" }}>
            現在「未設定」になっています。操作した人を特定できるよう、必ず設定してください。
          </strong>
        )}
      </p>
      <form onSubmit={submit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 山田 花子"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "10px 12px",
            fontSize: 15,
            border: `1px solid ${brand.line}`,
            borderRadius: 10,
            marginBottom: 12,
          }}
        />
        {err && (
          <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 10 }}>{err}</div>
        )}
        {notice && (
          <div
            style={{
              fontSize: 13,
              color: brand.tealDark,
              background: "#E2F3F1",
              borderRadius: 10,
              padding: "8px 12px",
              marginBottom: 10,
            }}
          >
            {notice}
          </div>
        )}
        <Btn type="submit" disabled={busy}>
          {busy ? "変更中…" : "氏名を変更する"}
        </Btn>
      </form>
    </Card>
  );
}
