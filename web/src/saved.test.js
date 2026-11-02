import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SAVED_KEY, SAVED_MAX, readSaved, toggleId, writeSaved } from "./saved.js";

const memory = (init = {}) => {
  const data = { ...init };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
};

describe("관심 지원 저장", () => {
  it("추가하면 맨 앞, 다시 누르면 빠진다", () => {
    expect(toggleId(["a", "b"], "c")).toEqual(["c", "a", "b"]);
    expect(toggleId(["c", "a", "b"], "a")).toEqual(["c", "b"]);
  });

  it(`최대 ${SAVED_MAX}개까지만 보관한다(오래된 것부터 밀려남)`, () => {
    const many = Array.from({ length: SAVED_MAX }, (_, i) => `id${i}`);
    const next = toggleId(many, "new");
    expect(next).toHaveLength(SAVED_MAX);
    expect(next[0]).toBe("new");
    expect(next).not.toContain(`id${SAVED_MAX - 1}`);
  });

  it("저장소가 비었거나 깨졌거나 이상한 값이면 빈 목록", () => {
    expect(readSaved(memory())).toEqual([]);
    expect(readSaved(memory({ [SAVED_KEY]: "{깨짐" }))).toEqual([]);
    expect(readSaved(memory({ [SAVED_KEY]: JSON.stringify({ a: 1 }) }))).toEqual([]);
    expect(readSaved(memory({ [SAVED_KEY]: JSON.stringify(["a", 3, null, "b"]) }))).toEqual(["a", "b"]);
    expect(readSaved({ getItem() { throw new Error("blocked"); } })).toEqual([]);
  });

  it("쓰기에 실패해도 예외를 내지 않는다", () => {
    expect(() => writeSaved(["a"], { setItem() { throw new Error("quota"); } })).not.toThrow();
    const m = memory();
    writeSaved(["a", "b"], m);
    expect(readSaved(m)).toEqual(["a", "b"]);
  });

  it("정책 페이지 스크립트(policy.js)와 같은 규칙이다", () => {
    const mod = { exports: {} };
    new Function("module", readFileSync(new URL("../public/policy.js", import.meta.url), "utf-8"))(mod);
    const page = mod.exports.toggleId;
    const many = Array.from({ length: SAVED_MAX }, (_, i) => `id${i}`);
    for (const ids of [[], ["a"], ["a", "b", "c"], many]) {
      for (const id of ["a", "z", "id3"]) expect(page(ids, id)).toEqual(toggleId(ids, id));
    }
    expect(readFileSync(new URL("../public/policy.js", import.meta.url), "utf-8")).toContain(`"${SAVED_KEY}"`);
  });
});
