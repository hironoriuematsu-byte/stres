"use client";

// レーダーチャートの軸ラベル。長い尺度名(同僚サポート・身体的負担・コントロール など)は
// 2行に分けて描画し、グラフの端で文字が切れないようにする(recharts の PolarAngleAxis tick 用)
type TickProps = {
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  textAnchor?: "start" | "middle" | "end" | "inherit";
  payload?: { value?: string | number };
  fontSize?: number;
  fill?: string;
};

// 尺度名を2行に分ける位置を決める(全角4文字分以下は1行のまま。半角文字は0.5文字として数える)
export function splitRadarLabel(label: string): string[] {
  const s = String(label);
  const chars = [...s];
  const width = chars.reduce((w, c) => w + (/[\x20-\x7E]/.test(c) ? 0.5 : 1), 0);
  if (width <= 4) return [s];
  const at = s.indexOf("サポート");
  if (at > 0) return [s.slice(0, at), "サポート"];
  const paren = s.indexOf("(");
  if (paren > 0) return [s.slice(0, paren), s.slice(paren)];
  const mid = Math.ceil(chars.length / 2);
  return [chars.slice(0, mid).join(""), chars.slice(mid).join("")];
}

export function RadarTick({ x = 0, y = 0, cy = 0, textAnchor = "middle", payload, fontSize = 9.5, fill = "#44534F" }: TickProps) {
  const lines = splitRadarLabel(String(payload?.value ?? ""));
  const lineHeight = fontSize + 2;
  // 上側のラベルは上に、下側のラベルは下に伸ばし、グラフに重ならないようにする
  const above = y < cy;
  const firstDy = lines.length === 1 ? fontSize / 3 : above ? -(lineHeight * (lines.length - 1)) + fontSize / 3 : fontSize / 3;
  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={fontSize} fill={fill}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? firstDy : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}
