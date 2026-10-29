import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { emptyProfile, findServices, matchService } from "./matcher.js";

const svc = (over = {}) => ({
  id: "1", n: "테스트", o: "서울특별시 강남구", ot: "시군구", f: "생활안정",
  s: "", t: "", v: 0, c: {}, ...over,
});
const profile = (over = {}) => ({ ...emptyProfile(), ...over });

describe("연령", () => {
  it("범위 밖이면 제외", () => {
    const s = svc({ c: { a: [18, 39] } });
    expect(matchService(s, profile({ age: 30 }))).toBe(true);
    expect(matchService(s, profile({ age: 40 }))).toBe(false);
    expect(matchService(s, profile({ age: 17 }))).toBe(false);
  });
  it("상한 없음", () => {
    expect(matchService(svc({ c: { a: [65, null] } }), profile({ age: 80 }))).toBe(true);
  });
  it("나이 미입력이면 연령으로 거르지 않음", () => {
    expect(matchService(svc({ c: { a: [65, null] } }), profile())).toBe(true);
  });
});

describe("성별·소득", () => {
  it("성별 제한", () => {
    const s = svc({ c: { g: ["F"] } });
    expect(matchService(s, profile({ sex: "M" }))).toBe(false);
    expect(matchService(s, profile({ sex: "F" }))).toBe(true);
  });
  it("소득구간 제한", () => {
    const s = svc({ c: { i: [1, 2] } });
    expect(matchService(s, profile({ income: 3 }))).toBe(false);
    expect(matchService(s, profile({ income: 2 }))).toBe(true);
  });
});

describe("상황·가구", () => {
  it("선택이 없으면 임산부 전용 서비스는 제외", () => {
    expect(matchService(svc({ c: { p: ["0302"] } }), profile())).toBe(false);
  });
  it("임산부를 고르면 포함", () => {
    expect(matchService(svc({ c: { p: ["0302"] } }), profile({ persons: ["0302"] }))).toBe(true);
  });
  it("해당사항없음 코드가 있으면 선택이 없어도 포함", () => {
    expect(matchService(svc({ c: { p: ["0302", "0322"] } }), profile())).toBe(true);
  });
  it("한부모 전용은 한부모 선택 시에만", () => {
    const s = svc({ c: { h: ["0403"] } });
    expect(matchService(s, profile())).toBe(false);
    expect(matchService(s, profile({ households: ["0403"] }))).toBe(true);
  });
});

describe("사업자 전용", () => {
  const biz = svc({ c: { b: 1 } });
  it("개인 프로필에서는 숨김", () => {
    expect(matchService(biz, profile())).toBe(false);
  });
  it("사업자 모드에서는 노출", () => {
    expect(matchService(biz, profile({ business: true }))).toBe(true);
  });
  it("개인 대상 코드도 함께 있으면 개인에게 노출", () => {
    expect(matchService(svc({ c: { b: 1, p: ["0322"] } }), profile())).toBe(true);
  });
});

describe("지역", () => {
  it("다른 시도 지자체 서비스는 제외, 중앙부처는 포함", () => {
    const busan = svc({ o: "부산광역시", ot: "광역시도" });
    const central = svc({ o: "보건복지부", ot: "중앙행정기관" });
    expect(matchService(busan, profile({ region: "서울" }))).toBe(false);
    expect(matchService(central, profile({ region: "서울" }))).toBe(true);
  });
  it("충남은 충청남도로 매칭", () => {
    expect(matchService(svc({ o: "충청남도 서천군" }), profile({ region: "충남" }))).toBe(true);
    expect(matchService(svc({ o: "충청북도 청주시" }), profile({ region: "충남" }))).toBe(false);
  });
});

describe("조건 정보 없음", () => {
  it("통과시키되 uncertain 표시", () => {
    const [r] = findServices([svc({ c: { nc: 1 } })], profile({ age: 30, sex: "M" }));
    expect(r.uncertain).toBe(true);
  });
});

const REAL = new URL("../public/data/index.json", import.meta.url);
describe.skipIf(!existsSync(REAL))("실데이터 불변식", () => {
  const { services } = JSON.parse(readFileSync(REAL, "utf8"));
  const base = profile({ age: 30, sex: "M", income: 2, region: "서울" });

  it("모든 결과는 서울 또는 전국 서비스", () => {
    for (const r of findServices(services, base)) {
      const ok = ["중앙행정기관", "공공기관"].includes(r.ot) || r.o.includes("서울특별시");
      expect(ok, `${r.id} ${r.o}`).toBe(true);
    }
  });
  it("30세 대상이 아닌 연령 제한 서비스는 없다", () => {
    for (const r of findServices(services, base)) {
      const [lo, hi] = r.c.a ?? [null, null];
      expect(lo == null || 30 >= lo, r.id).toBe(true);
      expect(hi == null || 30 <= hi, r.id).toBe(true);
    }
  });
  it("임산부 선택 시 결과가 늘고 임산부 코드 서비스가 포함", () => {
    const without = findServices(services, base);
    const withP = findServices(services, { ...base, persons: ["0302"] });
    expect(withP.some((r) => r.c.p?.includes("0302"))).toBe(true);
    expect(withP.length).not.toBe(without.length);
  });
  it("개인 프로필에는 사업자 전용 서비스가 없다", () => {
    for (const r of findServices(services, base)) {
      expect(!(r.c.b && !r.c.p?.length && !r.c.h?.length), r.id).toBe(true);
    }
  });
});
