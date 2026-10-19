"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";
import { Btn } from "@/components/ui";

type Status = { available: boolean; intake: { id: string; status: string; reply: string | null; reply_sent_at: string | null } | null };

// マイページの申出欄に出す、事前問診(AI)の案内と医師からの返信のお知らせ
export function IntakeCta({ requestId, prominent }: { requestId: string; prominent?: boolean }) {
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
    return <div style={{ fontSize: 12.5, color: "#5B6B6A", marginTop: 8 }}>事前問診の内容を医師に送りました。医師からの返信をお待ちください。</div>;
  }
  if (prominent && !st.intake) {
    // 申出の直後: そのまま事前問診に進めるよう、大きく案内する
    return (
      <div style={{ marginTop: 12, background: "#FFF8EE", border: "1px solid #F0D9A8", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: brand.ink }}>続けて、面談前の事前問診に回答してください(約15〜20分)</div>
        <div style={{ fontSize: 13, color: "#44534F", lineHeight: 1.8, margin: "6px 0 10px" }}>
          医師との面談の前に、全員に回答をお願いしています。AIがいまの状況を詳しく伺い、医師が事前に確認するので、面談では解決策の相談に時間を使えます。中断しても、マイページから続きを再開できます。
        </div>
        <Link href={href}>
          <Btn tone="orange">事前問診に回答する</Btn>
        </Link>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10, background: "#fff", border: `1px solid ${brand.line}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 13, color: brand.ink, lineHeight: 1.7 }}>
        <strong>面談の前に、事前問診への回答をお願いします</strong>(約15〜20分)。AIがいまの状況を詳しく伺い、医師が事前に確認します。
      </div>
      <Link href={href} style={link}>
        {st.intake ? "事前問診の続きに回答する →" : "事前問診に回答する →"}
      </Link>
    </div>
  );
}
