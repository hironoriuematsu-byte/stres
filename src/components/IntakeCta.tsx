"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";

type Status = { available: boolean; intake: { id: string; status: string; reply: string | null; reply_sent_at: string | null } | null };

// マイページの申出欄に出す、事前ヒアリング(AI)の案内と医師からの返信のお知らせ
export function IntakeCta({ requestId }: { requestId: string }) {
  const [st, setSt] = useState<Status | null>(null);
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await createClient().auth.getSession();
      const res = await fetch(`/api/intake/status?requestId=${encodeURIComponent(requestId)}`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (res.ok) setSt(await res.json());
    })();
  }, [requestId]);

  if (!st || (!st.available && !st.intake)) return null;
  const href = `/intake/${requestId}`;
  const link = { display: "inline-block", marginTop: 8, color: brand.tealDark, fontWeight: 700, fontSize: 13 } as const;

  if (st.intake?.reply) {
    return (
      <Link href={href} style={link}>
        ✉️ 医師からの返信があります(確認する)
      </Link>
    );
  }
  if (st.intake && st.intake.status !== "in_progress") {
    return <div style={{ fontSize: 12.5, color: "#5B6B6A", marginTop: 8 }}>事前ヒアリングの内容を医師に送りました。医師からの返信をお待ちください。</div>;
  }
  return (
    <div style={{ marginTop: 10, background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 13, color: brand.ink, lineHeight: 1.7 }}>
        面談の前に、AIがいまの状況を伺います(任意・約10分)。医師が事前に確認するので、面談の時間を相談に使えます。
      </div>
      <Link href={href} style={link}>
        {st.intake ? "事前ヒアリングの続きをする →" : "事前ヒアリングを受ける →"}
      </Link>
    </div>
  );
}
