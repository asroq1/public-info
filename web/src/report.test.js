import { describe, expect, it } from "vitest";
import { REPORT_REPO, reportUrl } from "./report.js";

const svc = (over = {}) => ({ id: "105100000001", n: "근로·자녀장려금", u: "https://plus.gov.kr/x?a=1&b=2", ...over });
const parse = (url) => new URL(url);

describe("정보 오류 신고 링크", () => {
  it("GitHub 이슈 양식 주소에 정책 정보를 미리 채운다", () => {
    const u = parse(reportUrl(svc(), "https://site.kr"));
    expect(u.origin + u.pathname).toBe(`https://github.com/${REPORT_REPO}/issues/new`);
    expect(u.searchParams.get("template")).toBe("data-report.yml");
    expect(u.searchParams.get("title")).toBe("[정보 오류] 근로·자녀장려금");
    expect(u.searchParams.get("policy_id")).toBe("105100000001");
    expect(u.searchParams.get("policy_name")).toBe("근로·자녀장려금");
    expect(u.searchParams.get("page_url")).toBe("https://site.kr/p/105100000001");
    expect(u.searchParams.get("official_url")).toBe("https://plus.gov.kr/x?a=1&b=2"); // & 가 보존돼야 한다
  });
  it("제목이 너무 길면 줄이지만, 이름 칸에는 전체 이름을 넣는다", () => {
    const longName = "가".repeat(100);
    const u = parse(reportUrl(svc({ n: longName })));
    expect(u.searchParams.get("title").length).toBeLessThan(80);
    expect(u.searchParams.get("title").endsWith("…")).toBe(true);
    expect(u.searchParams.get("policy_name")).toBe(longName);
  });
  it("공백을 정리하고, 특수문자가 있어도 주소 구조가 깨지지 않는다", () => {
    const u = parse(reportUrl(svc({ n: "  월세 &template=evil#x  지원\n" })));
    expect(u.searchParams.get("template")).toBe("data-report.yml");   // 이름 속 &template= 이 양식 이름을 덮어쓰면 안 된다
    expect(u.searchParams.get("policy_name")).toBe("월세 &template=evil#x 지원");
    expect(u.hash).toBe("");
  });
  it("origin 이 없으면 페이지 주소 칸은 비운다", () => {
    expect(parse(reportUrl(svc())).searchParams.get("page_url")).toBe("");
  });
  it("개인정보를 담지 않는다(정책 정보 외의 항목이 없다)", () => {
    const keys = [...parse(reportUrl(svc(), "https://site.kr")).searchParams.keys()].sort();
    expect(keys).toEqual(["official_url", "page_url", "policy_id", "policy_name", "template", "title"]);
  });
});
