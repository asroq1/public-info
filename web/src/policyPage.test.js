import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// public/policy.js 는 번들 밖에서 브라우저가 일반 스크립트로 읽는 파일이다(이 패키지는 type: module 이라 import 할 수 없다).
// 내용을 그대로 실행해 내보낸 순수 함수만 검증한다. document 가 없으면 화면 초기화는 건너뛴다.
const mod = { exports: {} };
new Function("module", readFileSync(new URL("../public/policy.js", import.meta.url), "utf-8"))(mod);
const { hashText, docKeys, progressText, copyText } = mod.exports;

describe("서류 체크리스트", () => {
  it("같은 문구는 같은 키, 다른 문구는 다른 키", () => {
    expect(hashText("주민등록등본")).toBe(hashText("주민등록등본"));
    expect(hashText("주민등록등본")).not.toBe(hashText("가족관계증명서"));
  });

  it("문구가 같은 서류가 둘이면 순번으로 구분한다", () => {
    const [a, b, c] = docKeys(["신분증", "통장 사본", "신분증"]);
    expect(a).not.toBe(c);
    expect(c.startsWith(a + ".")).toBe(true);
    expect(b).not.toBe(a);
  });

  it("앞뒤 공백이 달라도 같은 서류로 본다", () => {
    expect(docKeys(["  신분증 "])[0]).toBe(docKeys(["신분증"])[0]);
  });

  it("서류가 바뀌어도 남은 서류의 키는 그대로다(순번이 아니라 문구 기준)", () => {
    const before = docKeys(["신분증", "통장 사본"]);
    const after = docKeys(["통장 사본"]);
    expect(after[0]).toBe(before[1]);
  });

  it("진행 문구", () => {
    expect(progressText(0, 0)).toBe("");
    expect(progressText(2, 5)).toBe("서류 5개 중 2개 준비됨");
    expect(progressText(5, 5)).toBe("서류를 모두 준비했어요");
  });

  it("복사 문구는 제목, 서류 목록, 주소 순이다", () => {
    expect(copyText("근로장려금 준비 서류", "https://x.kr/p/1", ["신분증 ", "통장 사본"])).toBe(
      "근로장려금 준비 서류\n\n- 신분증\n- 통장 사본\n\nhttps://x.kr/p/1",
    );
    expect(copyText("제목", "", ["서류"])).toBe("제목\n\n- 서류");
  });
});

describe("마감일 달력(.ics)", () => {
  const { buildIcs, foldLine, icsEscape, nextDay } = mod.exports;
  const now = new Date(Date.UTC(2026, 10, 2, 1, 2, 3));

  it("다음 날 계산: 달과 해가 바뀌어도 맞다", () => {
    expect(nextDay("20261231")).toBe("20270101");
    expect(nextDay("20260228")).toBe("20260301");
    expect(nextDay("20240228")).toBe("20240229");
  });

  it("특수문자를 이스케이프한다", () => {
    expect(icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("하루짜리 종일 일정, 3일 전 알림, 모든 줄은 CRLF", () => {
    const ics = buildIcs({ id: "X1", name: "근로장려금, 신청", end: "20261231", url: "https://x.kr/p/X1", now });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101\r\n");
    expect(ics).toContain("DTSTAMP:20261102T010203Z\r\n");
    expect(ics).toContain("TRIGGER:-P3D");
    expect(ics).toContain("SUMMARY:신청 마감: 근로장려금\\, 신청");
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false); // 맨 줄바꿈이 섞이지 않는다
  });

  it("한 줄은 75바이트를 넘지 않고, 접은 뒤 이어 붙이면 원래 줄과 같다(한글이 잘리지 않는다)", () => {
    const line = "SUMMARY:" + "신청 마감일이에요 공식 페이지에서 다시 확인하세요 ".repeat(5);
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});
