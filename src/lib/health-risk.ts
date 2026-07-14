// ============================================================
// 仕事のストレス判定図の健康リスク計算
//
// 出典: 東京大学大学院医学系研究科精神保健学分野「仕事のストレス判定図」
// テクニカルノート(平成11年度労働省「作業関連疾患の予防に関する研究」
// 報告書より最終案)。職業性ストレス簡易調査票用の係数を使用し、
// 全国平均値は東京医科大学プログラムの訂正値(推奨値)を採用。
//
//   健康リスク(A) = 100 × exp{(量的負担平均 − 全国平均)×α + (コントロール平均 − 全国平均)×β}
//   健康リスク(B) = 100 × exp{(上司支援平均 − 全国平均)×γ + (同僚支援平均 − 全国平均)×δ}
//   総合健康リスク = A × B ÷ 100   (全国平均 = 100)
//
// 判定図・係数は男女別のため、男女それぞれの平均点で算出し、
// 男女計は受検者数による加重平均で求める(参考値)。
// ============================================================

export type RiskGender = "male" | "female";

// 全国平均(mean)と回帰係数(coef): 職業性ストレス簡易調査票(3項目合計 3〜12点)
const NORMS: Record<
  RiskGender,
  {
    quant: { mean: number; coef: number };
    control: { mean: number; coef: number };
    boss: { mean: number; coef: number };
    coworker: { mean: number; coef: number };
  }
> = {
  male: {
    quant: { mean: 8.7, coef: 0.076 },
    control: { mean: 7.9, coef: -0.089 },
    boss: { mean: 7.5, coef: -0.097 },
    coworker: { mean: 8.1, coef: -0.097 },
  },
  female: {
    quant: { mean: 7.9, coef: 0.048 },
    control: { mean: 7.2, coef: -0.056 },
    boss: { mean: 6.6, coef: -0.097 },
    coworker: { mean: 8.2, coef: -0.097 },
  },
};

// 量-コントロール判定図の健康リスク(A)
export function riskQuantControl(quant: number, control: number, gender: RiskGender): number {
  const n = NORMS[gender];
  return 100 * Math.exp((quant - n.quant.mean) * n.quant.coef + (control - n.control.mean) * n.control.coef);
}

// 職場の支援判定図の健康リスク(B)
export function riskSupport(boss: number, coworker: number, gender: RiskGender): number {
  const n = NORMS[gender];
  return 100 * Math.exp((boss - n.boss.mean) * n.boss.coef + (coworker - n.coworker.mean) * n.coworker.coef);
}

// 総合健康リスク = A × B / 100
export function riskTotal(a: number, b: number): number {
  return (a * b) / 100;
}

// 男女別に算出したリスクを受検者数で加重平均して男女計を求める
export function combineByCount(
  male: number | null,
  maleN: number,
  female: number | null,
  femaleN: number
): number | null {
  if (male != null && female != null && maleN + femaleN > 0) {
    return (male * maleN + female * femaleN) / (maleN + femaleN);
  }
  if (male != null && maleN > 0) return male;
  if (female != null && femaleN > 0) return female;
  return null;
}

export type GroupHealthRisk = {
  a: number | null; // 量-コントロール判定図(男女計)
  b: number | null; // 職場の支援判定図(男女計)
  total: number | null; // 総合健康リスク(男女計)
};

// 男女別の判定図4尺度平均から、集団の健康リスク(男女計)を算出する
export function groupHealthRisk(input: {
  male: { quant: number; control: number; boss: number; coworker: number; n: number } | null;
  female: { quant: number; control: number; boss: number; coworker: number; n: number } | null;
}): GroupHealthRisk {
  const m = input.male;
  const f = input.female;
  const aM = m ? riskQuantControl(m.quant, m.control, "male") : null;
  const bM = m ? riskSupport(m.boss, m.coworker, "male") : null;
  const aF = f ? riskQuantControl(f.quant, f.control, "female") : null;
  const bF = f ? riskSupport(f.boss, f.coworker, "female") : null;

  const a = combineByCount(aM, m?.n ?? 0, aF, f?.n ?? 0);
  const b = combineByCount(bM, m?.n ?? 0, bF, f?.n ?? 0);
  const totalM = aM != null && bM != null ? riskTotal(aM, bM) : null;
  const totalF = aF != null && bF != null ? riskTotal(aF, bF) : null;
  const total = combineByCount(totalM, m?.n ?? 0, totalF, f?.n ?? 0);

  return { a, b, total };
}

// 表示用の色分け: 全国平均100 / 120以上は要注意 / 150以上は要対応
export function riskTone(v: number | null): "teal" | "yellow" | "orange" | "red" | "gray" {
  if (v == null) return "gray";
  if (v >= 150) return "red";
  if (v >= 120) return "orange";
  if (v >= 100) return "yellow";
  return "teal";
}
