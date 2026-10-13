import type { SupabaseClient } from "@supabase/supabase-js";
import { pricingFor, type PlanPriceRow, type Pricing } from "@/lib/plan";

// 年度ごとの料金(plan_prices)を読む。誰でも読める表。読めないとき(未作成など)は空 → 既定の料金になる
export async function loadPlanPrices(sb: Pick<SupabaseClient, "from">): Promise<PlanPriceRow[]> {
  const { data, error } = await sb.from("plan_prices").select("fiscal_year, unit_price, min_total, note").order("fiscal_year");
  return error ? [] : ((data as PlanPriceRow[] | null) ?? []);
}

export async function loadPricing(sb: Pick<SupabaseClient, "from">, fiscalYear: number): Promise<Pricing> {
  return pricingFor(await loadPlanPrices(sb), fiscalYear);
}
