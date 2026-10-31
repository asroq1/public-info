import { describe, expect, it, vi } from "vitest";
import { matchDigest, renderDigest } from "../../functions/_lib/digest.js";
import { alertsEnabled } from "../../functions/_lib/db.js";
import { confirmEmail, sendEmails } from "../../functions/_lib/email.js";
import { escapeHtml, randomToken, safeEqual } from "../../functions/_lib/util.js";
import { normalizeEmail, normalizeProfile } from "../../functions/_lib/validate.js";
import { emptyProfile } from "./matcher.js";

const item = (over = {}) => ({ id: "1", n: "청년 월세", o: "서울특별시", ot: "광역시도", f: "주거", u: "u", d: "", c: {}, ...over });

describe("입력 검증", () => {
  it("이메일", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
    for (const bad of ["", "a@b", "a b@c.com", "a@@c.com", "<x>@c.com", `${"a".repeat(250)}@c.com`, null]) {
      expect(normalizeEmail(bad), String(bad)).toBeNull();
    }
  });
  it("프로필은 허용된 값만 남긴다", () => {
    const p = normalizeProfile({
      age: "30", birthYear: 1995, household: 4, monthlyIncome: "300", sex: "X", income: 9, region: "서울", persons: ["0302", "evil", "0302"],
      households: ["0403", 5], business: true, field: "x", q: "y", extra: "z",
    });
    expect(p).toEqual({
      sex: null, income: null, region: "서울", persons: ["0302"],
      households: ["0403"], business: false, field: "", q: "",
    });
  });
  it("나이·출생연도·가구원 수·월 소득 원본은 저장하지 않는다", () => {
    const p = normalizeProfile({ age: 30, birthYear: 1995, household: 4, monthlyIncome: "300", income: 2 });
    for (const key of ["age", "birthYear", "household", "monthlyIncome"]) expect(p).not.toHaveProperty(key);
    expect(p.income).toBe(2); // 구간만 저장
  });
  it("잘못된 입력에도 안전", () => {
    expect(normalizeProfile(null).region).toBe("");
    expect(normalizeProfile({ age: "", region: "없는지역", persons: "0302" })).toMatchObject({
      region: "", persons: [],
    });
  });
});

describe("알림 매칭", () => {
  const todayChanges = {
    new: [item({ id: "n1" }), item({ id: "n2", o: "부산광역시", c: { p: ["0302"] } })],
    updated: [item({ id: "u1", n: "임산부 지원", c: { p: ["0302"] }, ot: "중앙행정기관", o: "보건복지부" })],
  };
  it("프로필에 맞는 것만 고른다", () => {
    const m = matchDigest({ ...emptyProfile(), region: "서울" }, todayChanges);
    expect(m.added.map((s) => s.id)).toEqual(["n1"]);
    expect(m.updated).toEqual([]);
  });
  it("임산부를 선택하면 변경 서비스도 포함", () => {
    const m = matchDigest({ ...emptyProfile(), region: "서울", persons: ["0302"] }, todayChanges);
    expect(m.updated.map((s) => s.id)).toEqual(["u1"]);
  });
  it("맞는 게 없으면 null", () => {
    expect(matchDigest({ ...emptyProfile(), region: "제주" }, { new: [item()], updated: [] })).toBeNull();
  });
});

describe("메일 본문", () => {
  const ctx = { siteName: "내 혜택 찾기", siteUrl: "https://s.kr", date: "2026-10-30", unsubscribeUrl: "https://s.kr/api/unsubscribe?t=abc" };
  it("HTML 이스케이프와 링크, 수신거부", () => {
    const mail = renderDigest({ added: [item({ n: "<script>x</script>" })], updated: [] }, ctx);
    expect(mail.html).not.toContain("<script>x");
    expect(mail.html).toContain("https://s.kr/p/1");
    expect(mail.text).toContain("수신거부: https://s.kr/api/unsubscribe?t=abc");
    expect(mail.subject).toContain("1건");
  });
  it("섹션당 10건까지만 보여주고 나머지는 개수로 알린다", () => {
    const many = Array.from({ length: 13 }, (_, i) => item({ id: String(i) }));
    const mail = renderDigest({ added: many, updated: [] }, ctx);
    expect(mail.text).toContain("…외 3건");
    expect(mail.text.match(/\/p\//g)).toHaveLength(10);
  });
  it("확인 메일에 링크 포함", () => {
    expect(confirmEmail({ confirmUrl: "https://s.kr/api/confirm?t=1", siteName: "x" }).text).toContain("https://s.kr/api/confirm?t=1");
  });
});

describe("발송", () => {
  it("키가 없고 dry-run 도 아니면 실패한다", async () => {
    await expect(sendEmails({}, [{ to: "a@b.co", subject: "s", text: "t", html: "h" }])).rejects.toThrow();
  });
  it("dry-run 은 성공으로 처리하고 외부 호출을 하지 않는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendEmails({ ALLOW_DRY_RUN: "1" }, [{ to: "a@b.co", subject: "s", text: "t", html: "h" }])).toEqual([true]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    log.mockRestore();
  });
  it("100통씩 나눠 보내고 실패는 해당 묶음만 false", async () => {
    const msgs = Array.from({ length: 150 }, (_, i) => ({ to: `u${i}@b.co`, subject: "s", text: "t", html: "h" }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("limit", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await sendEmails({ RESEND_API_KEY: "k", FROM_EMAIL: "f@x.kr" }, msgs);
    vi.unstubAllGlobals();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.slice(0, 100).every(Boolean)).toBe(true);
    expect(res.slice(100).every((v) => v === false)).toBe(true);
  });
});

describe("유틸", () => {
  it("토큰은 64자 hex 이고 매번 다르다", () => {
    const a = randomToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(randomToken()).not.toBe(a);
  });
  it("safeEqual", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
    expect(safeEqual(undefined, "x")).toBe(false);
  });
  it("escapeHtml", () => expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;"));
  it("알림 활성 조건", () => {
    expect(alertsEnabled({})).toBe(false);
    expect(alertsEnabled({ DB: {}, FROM_EMAIL: "f", RESEND_API_KEY: "k" })).toBe(true);
    expect(alertsEnabled({ DB: {}, FROM_EMAIL: "f" })).toBe(false);
    expect(alertsEnabled({ DB: {}, FROM_EMAIL: "f", ALLOW_DRY_RUN: "1" })).toBe(true);
  });
});
