// 내 조건을 링크로 나누기. 주소의 '#' 뒤(해시)에만 담아서 서버로 전송되지 않는다.
// 담는 것은 지역·시군구·성별·소득 구간·나의 상황·가구 상황·사업자 여부뿐이다.
// 출생연도, 가구원 수, 월 소득 금액은 개인정보에 가까워 링크에 넣지 않는다(받는 사람이 직접 입력).
import { HOUSEHOLD_TRAITS, INCOME_LABELS, PERSON_TRAITS } from "./matcher.js";

const SEXES = new Set(["M", "F"]);

export function shareParams(profile) {
  const q = new URLSearchParams();
  if (profile.region) q.set("r", profile.region);
  if (profile.region && profile.district) q.set("d", profile.district);
  if (SEXES.has(profile.sex)) q.set("s", profile.sex);
  if (profile.income != null && INCOME_LABELS[profile.income]) q.set("i", String(profile.income));
  if (profile.persons?.length) q.set("p", profile.persons.join(","));
  if (profile.households?.length) q.set("h", profile.households.join(","));
  if (profile.business) q.set("b", "1");
  return q.toString();
}

export function shareUrl(origin, profile) {
  const params = shareParams(profile);
  return params ? `${origin}/#${params}` : `${origin}/`;
}

/**
 * 링크의 해시를 프로필 일부로 읽는다. 알려진 값만 받고 나머지는 버린다. 공유된 값이 하나도 없으면 null.
 * 지역·시군구가 지금 데이터에 있는지는 앱이 데이터를 받은 뒤에 따로 걸러 낸다.
 */
export function parseShare(hash) {
  const raw = String(hash ?? "").replace(/^#/, "");
  if (!raw) return null;
  const q = new URLSearchParams(raw);
  const patch = {};
  const region = q.get("r");
  if (region && region.length <= 30) {
    patch.region = region;
    const district = q.get("d");
    if (district && district.length <= 30) patch.district = district;
  }
  if (SEXES.has(q.get("s"))) patch.sex = q.get("s");
  const income = Number(q.get("i"));
  if (Number.isInteger(income) && INCOME_LABELS[income]) patch.income = income;
  const persons = (q.get("p") ?? "").split(",").filter((c) => PERSON_TRAITS[c]);
  if (persons.length) patch.persons = [...new Set(persons)];
  const households = (q.get("h") ?? "").split(",").filter((c) => HOUSEHOLD_TRAITS[c]);
  if (households.length) patch.households = [...new Set(households)];
  if (q.get("b") === "1") patch.business = true;
  return Object.keys(patch).length ? patch : null;
}
