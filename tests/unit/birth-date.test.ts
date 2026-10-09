import { describe, expect, it } from "vitest";
import { ageAt, birthDateError, birthDateInputValue, birthTextError, formatBirthDate, isMissingBirthDateColumn, parseBirthDateInput } from "@/lib/birth-date";

const today = new Date(2026, 9, 5); // 2026-10-05

describe("birth-date", () => {
  it("妥当な生年月日は通る", () => {
    expect(birthDateError("1975-04-01", today)).toBeNull();
    expect(birthDateError("2011-10-05", today)).toBeNull(); // ちょうど15歳
  });
  it("形式・存在しない日付・年齢範囲外を弾く", () => {
    expect(birthDateError("", today)).toMatch(/入力/);
    expect(birthDateError("1975/4/1", today)).toMatch(/形式/);
    expect(birthDateError("1975-02-30", today)).toMatch(/存在しない/);
    expect(birthDateError("2012-01-01", today)).toMatch(/15歳/);
    expect(birthDateError("1920-01-01", today)).toMatch(/100歳/);
  });
  it("年齢と表示", () => {
    expect(ageAt("1975-04-01", today)).toBe(51);
    expect(ageAt("1975-12-01", today)).toBe(50);
    expect(formatBirthDate("1975-04-01")).toBe("1975/4/1");
    expect(formatBirthDate(null)).toBe("");
  });
  it("列が無いエラーを見分ける", () => {
    expect(isMissingBirthDateColumn("column profiles.birth_date does not exist")).toBe(true);
    expect(isMissingBirthDateColumn("Could not find the 'birth_date' column of 'profiles' in the schema cache")).toBe(true);
    expect(isMissingBirthDateColumn("permission denied")).toBe(false);
  });
  it("直接入力(数字8けた・区切り・和暦・全角)を読み取る", () => {
    expect(parseBirthDateInput("19850304")).toBe("1985-03-04");
    expect(parseBirthDateInput("1985/3/4")).toBe("1985-03-04");
    expect(parseBirthDateInput("1985-03-04")).toBe("1985-03-04");
    expect(parseBirthDateInput("1985年3月4日")).toBe("1985-03-04");
    expect(parseBirthDateInput("S60.3.4")).toBe("1985-03-04");
    expect(parseBirthDateInput("昭和60年3月4日")).toBe("1985-03-04");
    expect(parseBirthDateInput("H1.3.24")).toBe("1989-03-24");
    expect(parseBirthDateInput("平成元年3月24日")).toBe("1989-03-24");
    expect(parseBirthDateInput("１９８５０３０４")).toBe("1985-03-04");
    expect(parseBirthDateInput("19850230")).toBeNull();
    expect(parseBirthDateInput("850304")).toBeNull();
    expect(birthDateInputValue("1985-03-04")).toBe("19850304");
    expect(birthTextError("abc", today)).toMatch(/8けた/);
    expect(birthTextError("19850304", today)).toBeNull();
  });
});
