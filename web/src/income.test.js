import { describe, expect, it } from "vitest";
import { MEDIAN_INCOME, bracketLimits, incomeBracket, incomePercent, manwon, manwonFloor, medianIncome, tableYear } from "./income.js";

describe("기준 중위소득 표", () => {
  it("보건복지부 공표 값(2026, 2027)과 일치", () => {
    expect(medianIncome(1, 2026)).toBe(2564238);
    expect(medianIncome(4, 2026)).toBe(6494738);
    expect(medianIncome(7, 2026)).toBe(9515150);
    expect(medianIncome(1, 2027)).toBe(2736042);
    expect(medianIncome(4, 2027)).toBe(6929885);
  });
  it("가구원 수가 늘수록 커진다", () => {
    for (const rows of Object.values(MEDIAN_INCOME)) {
      expect(rows).toHaveLength(7);
      expect([...rows].sort((a, b) => a - b)).toEqual(rows);
    }
  });
  it("7인 초과는 7인 기준, 1 미만이나 숫자가 아니면 null", () => {
    expect(medianIncome(10, 2026)).toBe(medianIncome(7, 2026));
    expect(medianIncome("4", 2026)).toBe(medianIncome(4, 2026));
    expect(medianIncome(0, 2026)).toBeNull();
    expect(medianIncome(-2, 2026)).toBeNull();
    expect(medianIncome("abc", 2026)).toBeNull();
  });
  it("공표된 연도 범위 안에서 연도를 고른다", () => {
    expect(tableYear(2020)).toBe(2026);
    expect(tableYear(2026)).toBe(2026);
    expect(tableYear(2027)).toBe(2027);
    expect(tableYear(2031)).toBe(2027);
  });
  it("가구원 수를 모르면 null", () => {
    expect(medianIncome(null, 2026)).toBeNull();
    expect(medianIncome("", 2026)).toBeNull();
    expect(bracketLimits(undefined, 2026)).toBeNull();
  });
});

describe("소득 구간 계산 (2026, 4인 가구: 월 649만원)", () => {
  const b = (m) => incomeBracket(4, m, 2026);
  it("경계값은 이하(포함)로 계산", () => {
    expect(b(324)).toBe(1);   // 49.9%
    expect(b(324.7369)).toBe(1); // 정확히 50%
    expect(b(325)).toBe(2);   // 50.04% -> 51~75%
    expect(b(487)).toBe(2);   // 75.0%
    expect(b(488)).toBe(3);
    expect(b(649.4738)).toBe(3); // 정확히 100%
    expect(b(650)).toBe(4);
    expect(b(1298)).toBe(4);  // 199.9%
    expect(b(1300)).toBe(5);
    expect(b(0)).toBe(1);
  });
  it("입력이 부족하거나 잘못되면 null", () => {
    expect(incomeBracket(null, 300, 2026)).toBeNull();
    expect(incomeBracket(4, "", 2026)).toBeNull();
    expect(incomeBracket(4, null, 2026)).toBeNull();
    expect(incomeBracket(4, -5, 2026)).toBeNull();
    expect(incomeBracket(4, "abc", 2026)).toBeNull();
  });
  it("가구원 수에 따라 같은 소득도 구간이 달라진다", () => {
    expect(incomeBracket(1, 200, 2026)).toBe(3); // 1인: 78% (76~100%)
    expect(incomeBracket(4, 200, 2026)).toBe(1); // 4인: 31%
  });
  it("퍼센트와 상한 금액", () => {
    expect(Math.round(incomePercent(4, 300, 2026))).toBe(46);
    expect(bracketLimits(1, 2026)).toEqual([1282119, 1923179, 2564238, 5128476]);
    expect(manwon(1282119)).toBe("128만원");
    expect(manwon(5128476)).toBe("513만원");
  });
});

describe("표시 금액과 구간 계산의 일치", () => {
  it("구간 상한은 내림해 표시하므로 라벨과 계산이 어긋나지 않는다", () => {
    expect(manwonFloor(3247369)).toBe("324만원");
    expect(manwonFloor(3000000)).toBe("300만원"); // 딱 떨어지는 값
    expect(manwonFloor(1282119)).toBe("128만원");
  });
  it("모든 가구원 수·구간에서, 라벨의 정수 상한은 해당 구간이고 +1 은 다음 구간이다", () => {
    for (const year of [2026, 2027]) {
      for (let hh = 1; hh <= 7; hh++) {
        const limits = bracketLimits(hh, year);
        limits.forEach((limit, i) => {
          const upper = Math.floor(limit / 10000 + 1e-9);
          expect(incomeBracket(hh, upper, year), `${year} ${hh}인 상한 ${upper}`).toBe(i + 1);
          expect(incomeBracket(hh, upper + 1, year), `${year} ${hh}인 상한+1 ${upper + 1}`).toBe(i + 2);
        });
      }
    }
  });
});
