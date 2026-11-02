import { describe, expect, it } from "vitest";
import { emptyProfile } from "./matcher.js";
import { parseShare, shareParams, shareUrl } from "./share.js";

const full = {
  ...emptyProfile(),
  birthYear: 1995, household: 3, monthlyIncome: "412.5", sex: "F", income: 2,
  region: "서울특별시", district: "강남구", persons: ["0302", "0328"], households: ["0404"], business: true,
};

describe("조건 공유 링크", () => {
  it("개인정보에 가까운 값(출생연도, 가구원 수, 월 소득)은 링크에 담지 않는다", () => {
    const url = decodeURIComponent(shareUrl("https://x.kr", full));
    expect(url).not.toMatch(/1995|412|birth|household=|monthly/);
    expect(shareParams(full).split("&").map((kv) => kv.split("=")[0]).sort()).toEqual(["b", "d", "h", "i", "p", "r", "s"]);
  });

  it("담은 값은 그대로 되살아난다(왕복)", () => {
    const hash = shareUrl("https://x.kr", full).split("#")[1];
    expect(parseShare(`#${hash}`)).toEqual({
      region: "서울특별시", district: "강남구", sex: "F", income: 2, persons: ["0302", "0328"], households: ["0404"], business: true,
    });
  });

  it("조건이 없으면 해시 없는 주소", () => {
    expect(shareUrl("https://x.kr", emptyProfile())).toBe("https://x.kr/");
  });

  it("시군구는 시·도가 있을 때만 담는다", () => {
    expect(shareParams({ ...emptyProfile(), district: "강남구" })).toBe("");
  });

  it("알 수 없거나 이상한 값은 버리고, 남는 게 없으면 null", () => {
    expect(parseShare("")).toBeNull();
    expect(parseShare("#")).toBeNull();
    expect(parseShare("#s=X&i=9&i2=1&p=9999&h=abc&b=0")).toBeNull();
    expect(parseShare("#i=3&p=0302,9999,0302")).toEqual({ income: 3, persons: ["0302"] });
  });

  it("지나치게 긴 지역 이름은 받지 않는다", () => {
    expect(parseShare(`#r=${"가".repeat(31)}`)).toBeNull();
  });

  it("스크립트 조각이 들어 있어도 문자열로만 다룬다", () => {
    const patch = parseShare("#r=%3Cscript%3Ealert(1)%3C%2Fscript%3E&s=M");
    expect(patch.sex).toBe("M");
    expect(typeof patch.region).toBe("string"); // 이후 지역 목록에 없으면 앱이 비운다
  });
});
