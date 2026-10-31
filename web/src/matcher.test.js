import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { ageOutOfRange, candidateAges, emptyProfile, findServices, groupKey, groupResults, matchReasons, matchService, migrateRegion, orderRegions, regionLabel } from "./matcher.js";

const svc = (over = {}) => ({
  id: "1", n: "테스트", o: "서울특별시 강남구", ot: "시군구", r: "서울특별시", g: "강남구", f: "생활안정",
  s: "", t: "", v: 0, c: {}, ...over,
});
const profile = (over = {}) => ({ ...emptyProfile(), ...over });

describe("연령", () => {
  it("범위 밖이어도 제외하지 않고 확인 표시만 한다", () => {
    const s = svc({ c: { a: [18, 39] } });
    expect(matchService(s, profile({ age: 40 }))).toBe(true);
    expect(findServices([s], profile({ age: 40 }))[0].ageCheck).toBe(true);
    expect(findServices([s], profile({ age: 30 }))[0].ageCheck).toBe(false);
    expect(findServices([s], profile({ age: 17 }))[0].ageCheck).toBe(true);
  });
  it("상한 없음", () => {
    const [r] = findServices([svc({ c: { a: [65, null] } })], profile({ age: 80 }));
    expect(r.ageCheck).toBe(false);
  });
  it("나이 미입력이면 표시하지 않음", () => {
    const [r] = findServices([svc({ c: { a: [65, null] } })], profile());
    expect(r.ageCheck).toBe(false);
  });
  it("나이가 맞는 서비스를 먼저 보여준다", () => {
    const inRange = svc({ id: "a", v: 1, c: { a: [18, 39] } });
    const out = svc({ id: "b", v: 99, c: { a: [60, null] } });
    expect(findServices([out, inRange], profile({ age: 30 })).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("출생연도로 나이 계산", () => {
  it("생일 전후 두 경우를 후보로 둔다", () => {
    expect(candidateAges({ birthYear: 1995 }, 2026)).toEqual([30, 31]);
    expect(candidateAges({ birthYear: 2026 }, 2026)).toEqual([0]);
    expect(candidateAges({ birthYear: 2027 }, 2026)).toEqual([]); // 미래 연도는 무시
    expect(candidateAges({ birthYear: 1850 }, 2026)).toEqual([]);
    expect(candidateAges({ age: 40 }, 2026)).toEqual([40]); // 예전 저장값 호환
    expect(candidateAges({}, 2026)).toEqual([]);
  });
  it("후보 중 하나라도 범위 안이면 확인 표시를 하지 않는다", () => {
    const s = svc({ c: { a: [31, 39] } });
    expect(ageOutOfRange(s, { birthYear: 1995 }, 2026)).toBe(false); // 30 또는 31 -> 31 은 범위 안
    expect(ageOutOfRange(s, { birthYear: 1996 }, 2026)).toBe(true);  // 29 또는 30 -> 둘 다 밖
    expect(ageOutOfRange(svc({ c: { a: [65, null] } }), { birthYear: 1961 }, 2026)).toBe(false); // 64 또는 65
  });
  it("출생연도가 없으면 표시하지 않는다", () => {
    expect(ageOutOfRange(svc({ c: { a: [65, null] } }), {}, 2026)).toBe(false);
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
  const seoul = "서울특별시", busan = "부산광역시";
  const gangnam = svc({ r: seoul, g: "강남구" });
  const jung = (r) => svc({ id: `jung-${r}`, o: `${r} 중구`, r, g: "중구" });
  const city = svc({ id: "city", o: seoul, ot: "광역시도", r: seoul, g: undefined });
  const central = svc({ id: "central", o: "보건복지부", ot: "중앙행정기관", r: undefined, g: undefined });
  const unknown = svc({ id: "unknown", o: "광주문화재단", ot: "지방출자_출연기관", r: undefined, g: undefined });

  it("다른 시·도 정책은 제외하고 중앙부처는 포함", () => {
    expect(matchService(svc({ r: busan, g: undefined, ot: "광역시도" }), profile({ region: seoul }))).toBe(false);
    expect(matchService(central, profile({ region: seoul }))).toBe(true);
  });
  it("지역을 고르지 않으면 전부 포함", () => {
    for (const s of [gangnam, central, unknown]) expect(matchService(s, profile())).toBe(true);
  });
  it("시·도만 고르면 그 시·도의 모든 시·군·구 정책 포함", () => {
    expect(matchService(gangnam, profile({ region: seoul }))).toBe(true);
    expect(matchService(svc({ r: seoul, g: "서초구" }), profile({ region: seoul }))).toBe(true);
  });
  it("시·군·구를 고르면 같은 시·도의 다른 구 정책은 제외, 시·도 단위와 전국 정책은 포함", () => {
    const p = profile({ region: seoul, district: "강남구" });
    expect(matchService(gangnam, p)).toBe(true);
    expect(matchService(svc({ r: seoul, g: "서초구" }), p)).toBe(false);
    expect(matchService(city, p)).toBe(true);
    expect(matchService(central, p)).toBe(true);
  });
  it("같은 이름의 시·군·구는 시·도까지 같아야 일치(서울 중구 ≠ 부산 중구)", () => {
    const p = profile({ region: seoul, district: "중구" });
    expect(matchService(jung(seoul), p)).toBe(true);
    expect(matchService(jung(busan), p)).toBe(false);
  });
  it("지역을 알 수 없는 기관 정책은 지역을 고르면 제외", () => {
    expect(matchService(unknown, profile({ region: seoul }))).toBe(false);
  });
  it("예전에 저장된 약칭은 새 이름으로 바뀐다(광주·전남은 통합 이름으로)", () => {
    expect(migrateRegion("서울")).toBe("서울특별시");
    expect(migrateRegion("충남")).toBe("충청남도");
    expect(migrateRegion("광주")).toBe("전남광주통합특별시");
    expect(migrateRegion("전남")).toBe("전남광주통합특별시");
    expect(migrateRegion("서울특별시")).toBe("서울특별시");
    expect(migrateRegion(undefined)).toBe("");
  });
  it("표시 이름과 순서", () => {
    expect(regionLabel("전남광주통합특별시")).toBe("전남·광주");
    expect(regionLabel("새로생긴특별시")).toBe("새로생긴특별시");
    const names = orderRegions([{ name: "제주특별자치도" }, { name: "새로생긴특별시" }, { name: "서울특별시" }]).map((r) => r.name);
    expect(names).toEqual(["서울특별시", "제주특별자치도", "새로생긴특별시"]);
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
  const base = profile({ age: 30, sex: "M", income: 2, region: "서울특별시" });

  it("모든 결과는 서울 정책이거나 지역 없는 전국 정책이고, 결과가 비어 있지 않다", () => {
    const results = findServices(services, base);
    expect(results.length).toBeGreaterThan(100);
    for (const r of results) {
      const ok = r.r === "서울특별시" || (!r.r && ["중앙행정기관", "공공기관"].includes(r.ot));
      expect(ok, `${r.id} ${r.o}`).toBe(true);
    }
    expect(results.some((r) => r.ot === "시군구" && r.r === "서울특별시")).toBe(true);
  });
  it("시·군·구를 고르면 그 구 정책만 남고 다른 구는 없다", () => {
    const results = findServices(services, { ...base, district: "강남구" });
    expect(results.some((r) => r.g === "강남구")).toBe(true);
    expect(results.filter((r) => r.g && r.g !== "강남구")).toEqual([]);
    const all = findServices(services, base);
    expect(results.length).toBeLessThan(all.length);
  });
  it("전남·광주 사용자도 시·군·구 정책을 본다(통합 이전 이름으로 찾던 오류 방지)", () => {
    const region = "전남광주통합특별시";
    const results = findServices(services, profile({ region }));
    // 지역만 빼고 같은 조건에서 이 지역 시·군·구 정책이 몇 건인지(= 기대값)와 정확히 같아야 한다
    const expected = services.filter((s) => s.ot === "시군구" && s.r === region && matchService(s, profile()));
    expect(expected.length).toBeGreaterThan(100);
    expect(results.filter((r) => r.ot === "시군구").length).toBe(expected.length);
    expect(results.every((r) => r.r === region || !r.r)).toBe(true);
  });
  it("메타의 지역 목록이 정책의 지역과 일치", () => {
    const { meta } = JSON.parse(readFileSync(REAL, "utf8"));
    const names = new Set(meta.regions.map((r) => r.name));
    for (const s of services) if (s.r) expect(names.has(s.r), s.r).toBe(true);
    const sg = meta.regions.find((r) => r.name === "서울특별시");
    expect(sg.districts).toContain("강남구");
  });
  it("나이 코드 범위 밖인 결과는 모두 확인 표시가 붙는다", () => {
    for (const r of findServices(services, base)) {
      const [lo, hi] = r.c.a ?? [null, null];
      const out = (lo != null && 30 < lo) || (hi != null && 30 > hi);
      expect(r.ageCheck, r.id).toBe(out);
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

import { deadlineState, isClosed, todayInt } from "./matcher.js";

describe("신청 기한", () => {
  const T = 20261031;
  const d = (dl) => svc({ dl });
  it("종료일이 지난 것만 마감", () => {
    expect(deadlineState(d({ b: 20260401, e: 20260417 }), T).state).toBe("closed");
    expect(deadlineState(d({ e: 20261030 }), T).state).toBe("closed");
    expect(deadlineState(d({ e: 20261031 }), T)).toMatchObject({ state: "open", dday: 0 }); // 종료일 당일은 아직 열림
    expect(deadlineState(d({ e: 20261103 }), T)).toMatchObject({ state: "open", dday: 3 });
    expect(deadlineState(d({ e: 20261231 }), T).dday).toBe(61);
    expect(deadlineState(d({ b: 20261201, e: 20261215 }), T).state).toBe("upcoming");
  });
  it("월·연 경계에서도 남은 일수가 정확", () => {
    expect(deadlineState(d({ e: 20270105 }), 20261230).dday).toBe(6);
    expect(deadlineState(d({ e: 20280229 }), 20280228).dday).toBe(1); // 윤년
  });
  it("기한 정보가 없거나 시작일만 있으면 판단하지 않는다", () => {
    expect(deadlineState(svc({}), T)).toBeNull();
    expect(deadlineState(d({ b: 20260301 }), T)).toBeNull();
    expect(isClosed(svc({}), T)).toBe(false);
  });
  it("마감된 지원은 기본으로 숨기고 옵션으로 보여준다", () => {
    const list = [svc({ id: "old", dl: { b: 20260101, e: 20260131 } }), svc({ id: "live", dl: { e: 20261231 } }), svc({ id: "always" })];
    expect(findServices(list, profile(), T).map((s) => s.id).sort()).toEqual(["always", "live"]);
    expect(findServices(list, profile({ showClosed: true }), T).map((s) => s.id).sort()).toEqual(["always", "live", "old"]);
  });
  it("마감 임박순: 가까운 마감 -> 기한 모름 -> 마감된 것", () => {
    const list = [
      svc({ id: "unknown", v: 100 }),
      svc({ id: "later", v: 1, dl: { e: 20261231 } }),
      svc({ id: "soon", v: 1, dl: { e: 20261103 } }),
      svc({ id: "closed", v: 999, dl: { e: 20260101 } }),
    ];
    const ids = findServices(list, profile({ showClosed: true, sort: "deadline" }), T).map((s) => s.id);
    expect(ids).toEqual(["soon", "later", "unknown", "closed"]);
  });
  it("todayInt 형식", () => {
    expect(todayInt(new Date(2026, 9, 31))).toBe(20261031);
    expect(todayInt(new Date(2027, 0, 5))).toBe(20270105);
  });
});


describe("일치 이유(칩)", () => {
  const Y = 2026;
  const labels = (service, p) => matchReasons(service, profile(p), Y).map((r) => r.label);

  it("지역: 시·군·구, 시·도 전체, 전국 공통", () => {
    expect(labels(svc({ r: "서울특별시", g: "강남구" }), { region: "서울특별시", district: "강남구" })).toEqual(["서울 강남구"]);
    expect(labels(svc({ r: "서울특별시", g: "강남구" }), { region: "서울특별시" })).toEqual(["서울 강남구"]);
    expect(labels(svc({ r: "서울특별시", g: undefined, ot: "광역시도" }), { region: "서울특별시", district: "강남구" })).toEqual(["서울 전체"]);
    expect(labels(svc({ r: undefined, g: undefined, ot: "중앙행정기관" }), { region: "서울특별시" })).toEqual(["전국 공통"]);
    expect(labels(svc({ r: undefined, g: undefined, ot: "지방공기업" }), { region: "서울특별시" })).toEqual([]); // 지역 미상은 말하지 않는다
    expect(labels(svc(), {})).toEqual([]); // 지역을 고르지 않으면 지역 칩 없음
  });

  it("상황: 특정 대상만 가리킬 때, 내가 고른 것만", () => {
    const s = svc({ c: { p: ["0302", "0328"] } });
    expect(labels(s, { persons: ["0302"] })).toEqual(["임산부"]);
    expect(labels(s, { persons: ["0302", "0328", "0330"] })).toEqual(["임산부", "장애인"]);
    expect(labels(s, { persons: ["0330"] })).toEqual([]);
  });
  it("상황: '해당사항없음'이 함께 있으면 전체 대상이라 칩을 만들지 않는다", () => {
    expect(labels(svc({ c: { p: ["0302", "0322"] } }), { persons: ["0302"] })).toEqual([]);
    expect(labels(svc({ c: { h: ["0403", "0410"] } }), { households: ["0403"] })).toEqual([]);
  });
  it("상황: 대상이 너무 많으면(5개 이상) 칩을 만들지 않는다", () => {
    expect(labels(svc({ c: { p: ["0301", "0302", "0303", "0313", "0314"] } }), { persons: ["0302"] })).toEqual([]);
    expect(labels(svc({ c: { p: ["0301", "0302", "0303", "0313"] } }), { persons: ["0302"] })).toEqual(["임산부"]);
  });
  it("가구 상황", () => {
    expect(labels(svc({ c: { h: ["0403"] } }), { households: ["0403", "0404"] })).toEqual(["한부모·조손가정"]);
  });

  it("소득: 정책의 소득 기준을 말로 보여주고, 제한이 없으면 칩이 없다", () => {
    expect(labels(svc({ c: { i: [1] } }), { income: 1 })).toEqual(["중위소득 50% 이하"]);
    expect(labels(svc({ c: { i: [1, 2, 3] } }), { income: 2 })).toEqual(["중위소득 100% 이하"]);
    expect(labels(svc({ c: { i: [2, 3] } }), { income: 3 })).toEqual(["중위소득 50~100%"]);
    expect(labels(svc({ c: { i: [4, 5] } }), { income: 5 })).toEqual(["중위소득 100% 초과"]);
    expect(labels(svc({ c: { i: [1, 2, 3, 4, 5] } }), { income: 2 })).toEqual([]);     // 5개 모두 = 제한 없음
    expect(labels(svc({ c: { i: [1, 2] } }), { income: 4 })).toEqual([]);              // 내 구간이 아님
    expect(labels(svc({ c: { i: [1, 3] } }), { income: 3 })).toEqual([]);              // 연속이 아니면 말로 풀지 않는다
  });

  it("성별: 한쪽만 대상일 때", () => {
    expect(labels(svc({ c: { g: ["F"] } }), { sex: "F" })).toEqual(["여성 대상"]);
    expect(labels(svc({ c: { g: ["F"] } }), { sex: "M" })).toEqual([]);
    expect(labels(svc({ c: { g: ["M", "F"] } }), { sex: "F" })).toEqual([]);
  });

  it("나이: 범위 안일 때만, 밖이면 칩이 없다(별도 확인 배지가 담당)", () => {
    expect(labels(svc({ c: { a: [19, 34] } }), { birthYear: 2000 })).toEqual(["만 19~34세"]);   // 25~26세
    expect(labels(svc({ c: { a: [65, null] } }), { birthYear: 1950 })).toEqual(["만 65세 이상"]);
    expect(labels(svc({ c: { a: [null, 39] } }), { birthYear: 2000 })).toEqual(["만 39세 이하"]);
    expect(labels(svc({ c: { a: [19, 34] } }), { birthYear: 1960 })).toEqual([]);
    expect(labels(svc({ c: { a: [19, 34] } }), {})).toEqual([]);
    expect(labels(svc({ c: { a: [null, null] } }), { birthYear: 2000 })).toEqual([]);
  });

  it("여러 조건이 있으면 지역, 상황, 가구, 소득, 성별, 나이 순서", () => {
    const s = svc({ r: "서울특별시", g: "강남구", c: { p: ["0302"], h: ["0403"], i: [1], g: ["F"], a: [19, 45] } });
    const p = { region: "서울특별시", district: "강남구", persons: ["0302"], households: ["0403"], income: 1, sex: "F", birthYear: 1995 };
    expect(labels(s, p)).toEqual(["서울 강남구", "임산부", "한부모·조손가정", "중위소득 50% 이하", "여성 대상", "만 19~45세"]);
  });

  it("findServices 결과에 reasons 가 들어간다", () => {
    const [r] = findServices([svc({ c: { p: ["0302"] } })], profile({ persons: ["0302"] }));
    expect(r.reasons.map((x) => x.label)).toEqual(["임산부"]);
  });
});

describe.skipIf(!existsSync(REAL))("일치 이유: 실데이터에서 거짓 칩이 없다", () => {
  const { services } = JSON.parse(readFileSync(REAL, "utf8"));
  const p = profile({
    region: "서울특별시", district: "강남구", persons: ["0302", "0328", "0327"], households: ["0403", "0404"],
    income: 2, sex: "F", birthYear: 1995,
  });
  const results = findServices(services, p);

  it("칩이 붙은 결과가 충분히 있다", () => {
    expect(results.filter((r) => r.reasons.length > 0).length).toBeGreaterThan(100);
  });

  it("모든 칩은 정책의 실제 조건과 일치한다", () => {
    const personLabel = (code) => ({ "0302": "임산부", "0328": "장애인", "0327": "구직자·실업자" })[code];
    for (const r of results) {
      const c = r.c ?? {};
      for (const reason of r.reasons) {
        const tag = `${r.id} ${r.n} -> ${reason.kind}:${reason.label}`;
        if (reason.kind === "person") {
          const code = Object.entries({ "0302": "임산부", "0328": "장애인", "0327": "구직자·실업자" }).find(([, l]) => l === reason.label)?.[0];
          expect(c.p?.includes(code), tag).toBe(true);
          expect(c.p.includes("0322"), `전체 대상인데 칩이 붙음 ${tag}`).toBe(false);
          expect(c.p.length <= 4, tag).toBe(true);
        }
        if (reason.kind === "household") {
          expect(c.h && !c.h.includes("0410") && c.h.length <= 4, tag).toBe(true);
        }
        if (reason.kind === "income") {
          expect(c.i && c.i.length < 5 && c.i.includes(2), tag).toBe(true);
        }
        if (reason.kind === "sex") {
          expect(c.g, tag).toEqual(["F"]);
        }
        if (reason.kind === "age") {
          expect(r.ageCheck, tag).toBe(false);
          expect(c.a, tag).toBeTruthy();
        }
        if (reason.kind === "region") {
          expect(["전국 공통"].includes(reason.label) ? !r.r : r.r === "서울특별시", tag).toBe(true);
        }
      }
    }
  });

  it("전체 대상 정책(해당사항없음 포함)에는 상황 칩이 없다", () => {
    const general = results.filter((r) => r.c?.p?.includes("0322"));
    expect(general.length).toBeGreaterThan(50);
    expect(general.every((r) => !r.reasons.some((x) => x.kind === "person"))).toBe(true);
  });

  it("임산부 전용 정책에는 임산부 칩이 붙는다(누락 방지)", () => {
    const only = results.filter((r) => r.c?.p?.includes("0302") && !r.c.p.includes("0322") && r.c.p.length <= 4);
    expect(only.length).toBeGreaterThan(10);
    expect(only.every((r) => r.reasons.some((x) => x.label === "임산부"))).toBe(true);
  });
});


describe("같은 이름 묶기", () => {
  const T = 20261031;
  const mk = (id, over) => svc({ id, v: 1, ...over });
  const seoul = (id, g, n = "시민안전보험", over = {}) => mk(id, { n: `${g} ${n}`, o: `서울특별시 ${g}`, ot: "시군구", r: "서울특별시", g, ...over });

  it("이름 앞의 자기 지역명, 괄호, 띄어쓰기, 가운뎃점을 무시하고 같은 키가 된다", () => {
    const a = groupKey(seoul("a", "종로구", "산모·신생아 건강관리 지원"));
    const b = groupKey(mk("b", { n: "산모신생아건강관리지원(확대)", ot: "시군구", r: "부산광역시", g: "해운대구" }));
    const c = groupKey(mk("c", { n: "서울 산모신생아 건강관리 지원", ot: "시군구", r: "서울특별시", g: "강남구" }));
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
  it("지역 단계는 괄호를 무시하고, 중앙·광역 단계는 괄호를 유지한다(하위 사업이 달라서)", () => {
    const local = (n, g) => groupKey(mk("l", { n, ot: "시군구", r: "서울특별시", g }));
    expect(local("지역화폐(강남사랑상품권)", "강남구")).toBe(local("지역화폐(송파사랑상품권)", "송파구"));
    const central = (n) => groupKey(mk("c", { n, ot: "중앙행정기관" }));
    expect(central("무료 소송대리 서비스(기초생활보장수급자)")).not.toBe(central("무료 소송대리 서비스(근로자)"));
    expect(central("무료 소송대리 서비스(기초생활보장수급자)")).toBe(central("무료소송대리서비스 (기초생활보장수급자)"));
  });
  it("지역명이 띄어쓰기 없이 붙은 이름은 떼지 않는다(성북구민안전보험이 망가지지 않는다)", () => {
    expect(groupKey(mk("x", { n: "성북구민안전보험", ot: "시군구", r: "서울특별시", g: "성북구" }))).toBe("l|성북구민안전보험");
  });
  it("중앙·광역·지역 단계가 다르면 이름이 같아도 묶지 않는다", () => {
    const central = groupKey(mk("c", { n: "산모신생아건강관리지원", ot: "중앙행정기관" }));
    const metro = groupKey(mk("m", { n: "산모신생아건강관리지원", ot: "광역시도", r: "서울특별시" }));
    const local = groupKey(mk("l", { n: "산모신생아건강관리지원", ot: "시군구", r: "서울특별시", g: "강남구" }));
    expect(new Set([central, metro, local]).size).toBe(3);
  });
  it("너무 짧은 이름은 묶지 않는다", () => {
    expect(groupKey(mk("s", { n: "장학금", ot: "시군구" }))).toBeNull();
    expect(groupKey(mk("s2", { n: "지역화폐", ot: "시군구" }))).not.toBeNull();
  });

  it("내 시·군·구 정책이 대표가 되고 나머지는 가까운 순으로 others", () => {
    const rows = [seoul("1", "종로구"), seoul("2", "강남구"), seoul("3", "서초구"), mk("4", { n: "시민안전보험", ot: "시군구", r: "부산광역시", g: "중구", o: "부산광역시 중구" })];
    const out = groupResults(rows.map((r) => ({ ...r, reasons: [], ageCheck: false, deadline: null })), profile({ region: "서울특별시", district: "강남구" }));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("2");
    expect(out[0].others.map((o) => o.id)).toEqual(["1", "3", "4"]);
  });
  it("지역을 고르지 않으면 조회수가 높은 것이 대표", () => {
    const rows = [seoul("1", "종로구", "시민안전보험", { v: 5 }), seoul("2", "강남구", "시민안전보험", { v: 50 })];
    const out = groupResults(rows.map((r) => ({ ...r, reasons: [], ageCheck: false, deadline: null })), profile());
    expect(out[0].id).toBe("2");
  });
  it("마감된 것은 대표가 되지 않는다", () => {
    const rows = [seoul("1", "종로구", "시민안전보험", { v: 100 }), seoul("2", "강남구", "시민안전보험", { v: 1 })].map((r, i) => ({ ...r, reasons: [], ageCheck: false, deadline: i === 0 ? { state: "closed", end: 20260101 } : null }));
    expect(groupResults(rows, profile())[0].id).toBe("2");
  });
  it("묶음의 위치는 선택한 정렬에서 가장 앞선 구성원을 따른다", () => {
    const rows = [mk("a", { n: "고유한정책이름하나" }), seoul("1", "종로구"), mk("b", { n: "고유한정책이름둘" }), seoul("2", "강남구")].map((r) => ({ ...r, reasons: [], ageCheck: false, deadline: null }));
    const out = groupResults(rows, profile());
    expect(out.map((o) => o.n.slice(0, 3))).toEqual(["고유한", "종로구", "고유한"]);
    expect(out[1].others).toHaveLength(1);
  });
  it("묶어도 정책이 사라지지 않는다(대표 + others 합계가 입력 개수와 같다)", () => {
    const rows = [seoul("1", "종로구"), seoul("2", "강남구"), mk("3", { n: "전혀다른정책입니다" })].map((r) => ({ ...r, reasons: [], ageCheck: false, deadline: null }));
    const out = groupResults(rows, profile());
    expect(out.reduce((n, o) => n + 1 + o.others.length, 0)).toBe(rows.length);
  });
});

describe.skipIf(!existsSync(REAL))("같은 이름 묶기: 실데이터", () => {
  const { services } = JSON.parse(readFileSync(REAL, "utf8"));
  const rows = findServices(services, profile({ showClosed: true }), 20261031);

  it("정책이 하나도 사라지거나 중복되지 않는다", () => {
    const out = groupResults(rows, profile({ showClosed: true }));
    const ids = out.flatMap((o) => [o.id, ...o.others.map((x) => x.id)]);
    expect(ids).toHaveLength(rows.length);
    expect(new Set(ids).size).toBe(rows.length);
  });
  it("한 묶음 안의 정책은 모두 같은 키를 가진다", () => {
    for (const o of groupResults(rows, profile({ showClosed: true }))) {
      const key = groupKey(o);
      for (const other of o.others) expect(groupKey(other), `${o.n} / ${other.n}`).toBe(key);
    }
  });
  it("실제로 카드 수가 크게 줄고, 큰 묶음이 있다", () => {
    const out = groupResults(rows, profile({ showClosed: true }));
    expect(out.length).toBeLessThan(rows.length * 0.8);
    expect(Math.max(...out.map((o) => o.others.length))).toBeGreaterThan(30);
  });
  it("서울 강남구를 고르면 대표는 강남구·서울·전국 정책이다(다른 지역이 대표가 되지 않는다)", () => {
    const p = profile({ region: "서울특별시", district: "강남구", showClosed: true });
    const grouped = groupResults(findServices(services, p, 20261031), p);
    for (const o of grouped) {
      for (const other of o.others) {
        const rank = (s) => (s.r === "서울특별시" && s.g === "강남구" ? 0 : s.r === "서울특별시" ? 1 : !s.r ? 2 : 3);
        expect(rank(o) <= rank(other), `${o.n}: 대표(${o.o}) 보다 ${other.o} 가 더 가깝다`).toBe(true);
      }
    }
  });
});
