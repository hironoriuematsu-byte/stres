"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

const input = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px 12px",
  fontSize: 15,
  border: `1px solid ${brand.line}`,
  borderRadius: 10,
};

// 事業者担当者は受検を行わないため、氏名を入力する機会がない。
// 初回のご利用時にご本人に登録していただき、操作記録で誰の操作か
// 分かるようにする。
export function ProfileSetup({
  initialName,
  initialDept,
  companyName,
}: {
  initialName: string;
  initialDept: string;
  companyName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [dept, setDept] = useState(initialDept);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ name: name.trim(), dept: dept.trim() || null })
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.refresh();
  };

  return (
    <Card style={{ maxWidth: 560, margin: "0 auto" }}>
      <Badge tone="orange">はじめのご登録</Badge>
      <h2 style={{ fontSize: 19, color: brand.ink, margin: "12px 0 8px" }}>
        お名前をご登録ください
      </h2>
      <p style={{ fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "0 0 16px" }}>
        {companyName && <>{companyName}のご担当者としてご登録いただきます。</>}
        お名前は操作記録に残り、どなたの操作かを確認するために使用します。
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
          氏名(必須)
        </label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 山田 花子" style={input} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: brand.ink, display: "block", marginBottom: 5 }}>
          部署(任意)
        </label>
        <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="例: 総務部" style={input} />
      </div>

      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 10 }}>{err}</div>}

      <Btn onClick={save} disabled={busy || !name.trim()}>
        {busy ? "保存中…" : "登録してはじめる"}
      </Btn>
    </Card>
  );
}
