"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";

export function Attestation() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const attest = async () => {
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ no_personnel_authority: true, attested_at: new Date().toISOString() })
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.refresh();
  };

  return (
    <Card style={{ maxWidth: 620, margin: "0 auto" }}>
      <Badge tone="orange">実施事務従事者の誓約</Badge>
      <h2 style={{ fontSize: 20, color: brand.ink, margin: "12px 0 8px" }}>
        個人結果の閲覧には誓約が必要です
      </h2>
      <p style={{ fontSize: 14, color: "#44534F", lineHeight: 1.9, margin: "0 0 14px" }}>
        労働安全衛生法に基づくストレスチェック制度では、労働者の解雇・昇進・異動に関して直接の権限を持つ監督的地位にある者は、実施事務従事者になることができません(労働安全衛生規則第52条の10)。個人結果を閲覧する前に、以下の誓約をお願いします。
      </p>
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
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 14, color: brand.ink, lineHeight: 1.8 }}>
          私は、労働者の<strong>解雇・昇進・異動の決定権(人事権)を有しません</strong>。また、ストレスチェックの実施事務を通じて知り得た労働者の秘密を漏らしません(守秘義務: 労働安全衛生法第105条)。
        </span>
      </label>
      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginTop: 10 }}>{err}</div>}
      <div style={{ marginTop: 18 }}>
        <Btn onClick={attest} disabled={!checked || busy}>
          {busy ? "送信中…" : "誓約して閲覧をはじめる"}
        </Btn>
      </div>
    </Card>
  );
}
