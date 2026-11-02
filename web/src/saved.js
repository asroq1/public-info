// 관심 지원 저장. 정책 번호만 이 기기의 브라우저(localStorage)에 저장한다. 서버로 보내지 않는다.
// 정책 페이지의 public/policy.js 도 같은 키와 같은 규칙으로 읽고 쓴다(두 구현이 어긋나지 않는지 saved.test.js 가 확인).
export const SAVED_KEY = "benefit-saved-v1";
export const SAVED_MAX = 500;

export function readSaved(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage.getItem(SAVED_KEY));
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, SAVED_MAX) : [];
  } catch {
    return [];
  }
}

export function writeSaved(ids, storage = globalThis.localStorage) {
  try {
    storage.setItem(SAVED_KEY, JSON.stringify(ids));
  } catch {
    /* 저장소를 못 쓰는 환경에서는 이번 방문에서만 동작한다 */
  }
}

// 없으면 맨 앞에 추가(가장 최근), 있으면 뺀다.
export function toggleId(ids, id) {
  if (ids.includes(id)) return ids.filter((x) => x !== id);
  return [id, ...ids].slice(0, SAVED_MAX);
}
