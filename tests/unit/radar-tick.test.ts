import { describe, expect, it } from "vitest";
import { splitRadarLabel } from "@/components/RadarTick";

describe("レーダーチャートの軸ラベルの2行分割", () => {
  it("4文字以下は1行のまま", () => {
    expect(splitRadarLabel("活気")).toEqual(["活気"]);
    expect(splitRadarLabel("負担(量)")).toEqual(["負担(量)"]);
    expect(splitRadarLabel("対人関係")).toEqual(["対人関係"]);
  });

  it("「サポート」を含む名前はその前で分ける", () => {
    expect(splitRadarLabel("同僚サポート")).toEqual(["同僚", "サポート"]);
    expect(splitRadarLabel("上司サポート")).toEqual(["上司", "サポート"]);
  });

  it("それ以外の長い名前は中央で分ける", () => {
    expect(splitRadarLabel("身体的負担")).toEqual(["身体的", "負担"]);
    expect(splitRadarLabel("コントロール")).toEqual(["コント", "ロール"]);
    expect(splitRadarLabel("イライラ感")).toEqual(["イライ", "ラ感"]);
  });
});
