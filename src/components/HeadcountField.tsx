"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { brand } from "@/lib/brand";

// 在籍労働者数の入力欄。企業×年度ごとにデータベースへ保存し(0023 company_year_info)、
// 結果一覧と検査結果等報告書のどちらからでも同じ値を使う。
// 入力が止まって少し経つか、欄を離れたときに保存する
const SAVE_DELAY_MS = 1200;

export async function fetchHeadcount(
  supabase: SupabaseClient,
  companyId: string,
  fiscalYear: number
): Promise<{ value: string; error: string | null }> {
  const { data, error } = await supabase
    .from("company_year_info")
    .select("headcount")
    .eq("company_id", companyId)
    .eq("fiscal_year", fiscalYear)
    .maybeSingle();
  if (error) return { value: "", error: error.message };
  const h = (data as { headcount: number | null } | null)?.headcount;
  return { value: h == null ? "" : String(h), error: null };
}

export function HeadcountField({
  companyId,
  fiscalYear,
  value,
  onChange,
  canEdit = true,
  compact = false,
  inputStyle,
}: {
  companyId: string;
  fiscalYear: number;
  value: string;
  onChange: (v: string) => void; // 親はCSVや帳票の値として使う
  canEdit?: boolean;
  compact?: boolean; // 結果一覧の操作列など、小さく出す場合
  inputStyle?: React.CSSProperties;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lastSaved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 保存済みの値を読み込む
  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    fetchHeadcount(supabase, companyId, fiscalYear).then(({ value: v, error }) => {
      if (!alive) return;
      if (error) {
        setErr(
          /company_year_info|schema cache|relation/i.test(error)
            ? "在籍労働者数を保存する設定(SQL 0023)が未実行のため、この値は保存されません。"
            : `在籍労働者数を読み込めませんでした: ${error}`
        );
        return;
      }
      lastSaved.current = v;
      onChange(v);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, fiscalYear]);

  const save = async () => {
    if (!canEdit) return;
    const v = value.trim();
    if (lastSaved.current === v) return; // 変わっていない
    if (v !== "" && !/^\d+$/.test(v)) {
      setErr("在籍労働者数は0以上の整数で入力してください。");
      return;
    }
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("company_year_info").upsert(
      {
        company_id: companyId,
        fiscal_year: fiscalYear,
        headcount: v === "" ? null : Number(v),
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      },
      { onConflict: "company_id,fiscal_year" }
    );
    if (error) {
      setErr(
        /company_year_info|schema cache|relation/i.test(error.message)
          ? "在籍労働者数を保存する設定(SQL 0023)が未実行のため、この値は保存されません。"
          : `在籍労働者数を保存できませんでした: ${error.message}`
      );
      return;
    }
    lastSaved.current = v;
    setErr(null);
    setStatus("保存しました");
  };

  // 入力が止まったら保存する
  useEffect(() => {
    if (lastSaved.current === null) return; // 読み込み前
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <input
        type="number"
        min={0}
        value={value}
        readOnly={!canEdit}
        onChange={(e) => {
          onChange(e.target.value);
          setStatus(null);
        }}
        onBlur={save}
        placeholder="例: 120"
        style={{
          width: compact ? 90 : 160,
          padding: compact ? "7px 9px" : "8px 10px",
          fontSize: compact ? 13 : 14,
          border: `1px solid ${brand.line}`,
          borderRadius: 8,
          ...inputStyle,
        }}
      />
      {status && !err && <span style={{ fontSize: 11.5, color: brand.tealDark }}>{status}</span>}
      {err && <span style={{ fontSize: 11.5, color: "#B02A2A" }}>{err}</span>}
    </span>
  );
}
