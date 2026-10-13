"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadPlanPrices } from "@/lib/plan-prices";
import type { PlanPriceRow } from "@/lib/plan";

// 年度ごとの料金を読む(読み終わるまでは null。表示は既定の料金で計算してよい)
export function usePlanPrices(skip?: boolean): PlanPriceRow[] | null {
  const [rows, setRows] = useState<PlanPriceRow[] | null>(null);
  useEffect(() => {
    if (skip) return;
    loadPlanPrices(createClient()).then(setRows);
  }, [skip]);
  return rows;
}
