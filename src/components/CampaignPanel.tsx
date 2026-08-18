"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/client";
import { Badge, Btn, Card } from "@/components/ui";
import { brand } from "@/lib/brand";
import { logAccess } from "@/lib/log";

type Campaign = {
  id: string;
  company_id: string;
  fiscal_year: number;
  token: string;
  active: boolean;
  created_at: string;
};

// 受検用配布URL・QRコードの発行/表示
// office: 発行・再発行・停止が可能 / jimu: 自社分の閲覧・コピーのみ
// 操作はすべてSECURITY DEFINERのRPC経由(0009)。テーブルRLSの状態に依存しない
export function CampaignPanel({
  companyId,
  companyName,
  fiscalYear,
  manage,
}: {
  companyId: string;
  companyName: string;
  fiscalYear: number;
  manage: boolean;
}) {
  const [campaign, setCampaign] = useState<Campaign | null | "loading">("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const supabase = createClient();

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .rpc("get_campaign", { p_company: companyId, p_year: fiscalYear })
      .maybeSingle();
    if (error) setErr(error.message);
    setCampaign((data as Campaign) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fiscalYear]);

  useEffect(() => {
    setCampaign("loading");
    setErr(null);
    reload();
    logAccess(supabase, "view_campaign", `${companyName}/${fiscalYear}`, companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  const url =
    campaign && campaign !== "loading"
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/join/${campaign.token}`
      : null;

  useEffect(() => {
    if (url && campaign !== "loading" && campaign?.active) {
      QRCode.toDataURL(url, { width: 240, margin: 2 }).then(setQr).catch(() => setQr(null));
    } else {
      setQr(null);
    }
  }, [url, campaign]);

  const issue = async () => {
    setBusy(true);
    setErr(null);
    const { error } = await supabase.rpc("issue_campaign", {
      p_company: companyId,
      p_year: fiscalYear,
    });
    if (error) setErr(error.message);
    else logAccess(supabase, "issue_campaign", `${companyName}/${fiscalYear}`, companyId);
    setBusy(false);
    reload();
  };

  const rotate = async () => {
    if (campaign === "loading" || !campaign) return;
    if (!confirm("URLを再発行すると、配布済みの旧URLは使えなくなります。よろしいですか?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("rotate_campaign", { p_campaign: campaign.id });
    if (error) setErr(error.message);
    else logAccess(supabase, "rotate_campaign", `${companyName}/${fiscalYear}`, companyId);
    setBusy(false);
    reload();
  };

  const toggleActive = async () => {
    if (campaign === "loading" || !campaign) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_campaign_active", {
      p_campaign: campaign.id,
      p_active: !campaign.active,
    });
    if (error) setErr(error.message);
    else
      logAccess(
        supabase,
        campaign.active ? "campaign_deactivated" : "campaign_activated",
        `${companyName}/${fiscalYear}`,
        companyId
      );
    setBusy(false);
    reload();
  };

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (campaign === "loading") return <Card>読み込み中…</Card>;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 17, color: brand.ink, margin: 0 }}>
          受検用配布URL・QRコード({companyName} / {fiscalYear}年度)
        </h3>
        {campaign && (campaign.active ? <Badge>配布中</Badge> : <Badge tone="gray">停止中</Badge>)}
      </div>
      <p style={{ fontSize: 13, color: "#5B6B6A", margin: "6px 0 14px", lineHeight: 1.8 }}>
        このURLを社内の一斉メールや掲示で従業員に配布してください。従業員はURLから自分のメールアドレスでアカウント登録し、メール認証(本人確認)を済ませてから受検します。
      </p>

      {err && <div style={{ fontSize: 13, color: "#B02A2A", marginBottom: 10 }}>{err}</div>}

      {!campaign ? (
        manage ? (
          <Btn onClick={issue} disabled={busy}>
            {busy ? "発行中…" : `${fiscalYear}年度の配布URLを発行する`}
          </Btn>
        ) : (
          <p style={{ fontSize: 13, color: "#8A9694", margin: 0 }}>
            {fiscalYear}年度の配布URLはまだ発行されていません。実施者(産業医)にご依頼ください。
          </p>
        )
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              background: "#F4FAF9",
              border: `1px solid ${brand.line}`,
              borderRadius: 10,
              padding: "10px 14px",
            }}
          >
            <code style={{ fontSize: 13, color: brand.ink, wordBreak: "break-all", flex: 1, minWidth: 200 }}>{url}</code>
            <Btn tone="ghost" onClick={copy} style={{ padding: "7px 14px", fontSize: 13 }}>
              {copied ? "コピーしました ✓" : "URLをコピー"}
            </Btn>
          </div>

          {campaign.active && qr && (
            <div style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="受検用QRコード" width={160} height={160} style={{ border: `1px solid ${brand.line}`, borderRadius: 8 }} />
              <div style={{ display: "grid", gap: 8 }}>
                <a href={qr} download={`stresscheck_${companyName}_${fiscalYear}_QR.png`}>
                  <Btn tone="ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
                    QRコードをダウンロード(PNG)
                  </Btn>
                </a>
                <p style={{ fontSize: 12, color: "#8A9694", margin: 0 }}>
                  印刷して掲示板・社内報などにも利用できます。
                </p>
              </div>
            </div>
          )}

          {!campaign.active && (
            <p style={{ fontSize: 13, color: brand.orange, fontWeight: 700, marginTop: 12 }}>
              現在このURLは停止中です。従業員は登録できません。
            </p>
          )}

          {manage && (
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <Btn tone="ghost" onClick={toggleActive} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
                {campaign.active ? "配布を停止する" : "配布を再開する"}
              </Btn>
              <Btn tone="ghost" onClick={rotate} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
                URLを再発行する(旧URLは無効化)
              </Btn>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
