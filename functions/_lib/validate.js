import { HOUSEHOLD_TRAITS, PERSON_TRAITS, migrateRegion } from "../../web/src/matcher.js";

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

// 시·도·시군구 이름은 데이터에서 오므로 목록과 대조하지 않고 모양만 확인한다(목록에 없으면 어떤 정책과도 맞지 않을 뿐이다)
const REGION_RE = /^[가-힣]{2,15}$/;
const DISTRICT_RE = /^[가-힣0-9]{2,12}$/;

const intIn = (v, lo, hi) => {
  const n = Number(v);
  return v !== "" && v != null && Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};

/**
 * 클라이언트가 보낸 프로필에서 허용된 값만 남긴다. 알림 매칭에 실제로 쓰는 항목만 저장한다.
 * 나이(출생연도)는 알림 매칭에 쓰지 않으므로 저장하지 않는다.
 */
export function normalizeProfile(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const pick = (list, allowed) =>
    Array.isArray(list) ? [...new Set(list.filter((c) => c in allowed))] : [];
  return {
    sex: p.sex === "M" || p.sex === "F" ? p.sex : null,
    income: intIn(p.income, 1, 5),
    region: REGION_RE.test(migrateRegion(p.region)) ? migrateRegion(p.region) : "",
    district: REGION_RE.test(migrateRegion(p.region)) && DISTRICT_RE.test(p.district ?? "") ? p.district : "",
    persons: pick(p.persons, PERSON_TRAITS),
    households: pick(p.households, HOUSEHOLD_TRAITS),
    business: false,
    field: "",
    q: "",
  };
}
