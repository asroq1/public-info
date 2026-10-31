// 프로필과 서비스의 지원조건(c)을 비교해 "대상이 될 수 있는" 서비스를 추린다.
// 자격 판정이 아니라 후보 추림이다. 조건 정보가 없는 서비스는 통과시키되 uncertain 으로 표시한다.

// 화면에 보여줄 짧은 이름과 표시 순서. 지역 목록 자체는 데이터(index.json 의 meta.regions)에서 오고,
// 여기에 없는 새 시·도는 정식 이름 그대로 목록 끝에 붙는다.
export const REGION_SHORT = {
  서울특별시: "서울", 부산광역시: "부산", 대구광역시: "대구", 인천광역시: "인천", 전남광주통합특별시: "전남·광주",
  대전광역시: "대전", 울산광역시: "울산", 세종특별자치시: "세종", 경기도: "경기", 강원특별자치도: "강원",
  충청북도: "충북", 충청남도: "충남", 전북특별자치도: "전북", 경상북도: "경북", 경상남도: "경남", 제주특별자치도: "제주",
};
export const regionLabel = (full) => REGION_SHORT[full] ?? full;

export function orderRegions(list) {
  const order = Object.keys(REGION_SHORT);
  const rank = (name) => (order.includes(name) ? order.indexOf(name) : order.length);
  return [...list].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "ko"));
}

// 예전 버전이 저장한 짧은 지역 이름 -> 정식 이름. 광주광역시와 전라남도는 전남광주통합특별시로 합쳐졌다.
const LEGACY_REGIONS = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시", 광주: "전남광주통합특별시",
  대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시", 경기: "경기도", 강원: "강원특별자치도",
  충북: "충청북도", 충남: "충청남도", 전북: "전북특별자치도", 전남: "전남광주통합특별시", 경북: "경상북도",
  경남: "경상남도", 제주: "제주특별자치도",
};
export const migrateRegion = (r) => LEGACY_REGIONS[r] ?? r ?? "";

const NATIONWIDE_ORG_TYPES = new Set(["중앙행정기관", "공공기관"]);
const NO_PERSON_TRAIT = "0322"; // 해당사항없음
const NO_HOUSEHOLD_TRAIT = "0410"; // 해당사항없음

export const PERSON_TRAITS = {
  "0301": "예비부모·난임", "0302": "임산부", "0303": "출산·입양",
  "0317": "초등학생", "0318": "중학생", "0319": "고등학생", "0320": "대학생·대학원생",
  "0326": "근로자·직장인", "0327": "구직자·실업자", "0328": "장애인",
  "0329": "국가보훈대상자", "0330": "질병·질환자",
  "0313": "농업인", "0314": "어업인", "0315": "축산업인", "0316": "임업인",
};

export const HOUSEHOLD_TRAITS = {
  "0401": "다문화가족", "0402": "북한이탈주민", "0403": "한부모·조손가정",
  "0404": "1인가구", "0411": "다자녀가구", "0412": "무주택세대",
  "0413": "신규전입", "0414": "확대가족",
};

export const INCOME_LABELS = {
  1: "중위소득 50% 이하", 2: "중위소득 50~75%", 3: "중위소득 75~100%", 4: "중위소득 100~200%", 5: "중위소득 200% 초과",
};

export const emptyProfile = () => ({
  age: null, birthYear: null, household: null, monthlyIncome: "", sex: null, income: null, region: "", district: "",
  persons: [], households: [], business: false, field: "", q: "", showClosed: false, sort: "popular", group: true, kind: "", onlineOnly: false,
});

/**
 * 지역 일치. 정책의 지역(r: 시·도, g: 시·군·구)은 파이프라인이 기관명에서 확실한 경우만 채운다.
 * - 지역을 알 수 없는 정책은 중앙행정기관·공공기관(전국 공통)만 포함한다.
 * - 시·군·구를 골랐으면, 같은 시·도의 다른 시·군·구 정책은 뺀다. 시·도 단위(g 없음) 정책은 남긴다.
 */
function matchesRegion(service, { region, district }) {
  if (!region) return true;
  if (!service.r) return NATIONWIDE_ORG_TYPES.has(service.ot);
  if (service.r !== region) return false;
  return !district || !service.g || service.g === district;
}

// 선택한 특성과 서비스 대상 코드가 겹치는지. 선택이 없으면 "해당사항없음" 코드를 기준으로 본다.
function matchesTraits(serviceCodes, selected, noneCode) {
  if (!serviceCodes?.length) return true; // 제한 정보가 없으면 통과
  const wanted = selected.length ? selected : [noneCode];
  return wanted.some((code) => serviceCodes.includes(code));
}

// ---- 한눈에 보기: 지원 형태·신청 방식 ----------------------------------------------------------
// 인덱스의 k(지원 형태 이름 목록), kf(지원 형태 묶음), m(신청 방식 코드: g 정부24, on 온라인, v 방문, n 신청 불필요)을 쓴다.
export const KIND_FAMILIES = { cash: "현금·감면·융자", goods: "현물·이용권", service: "의료·돌봄·일자리·상담", edu: "교육·시설·문화", etc: "기타" };
export const METHOD_LABELS = { g: "정부24 신청", on: "온라인 신청", v: "방문 신청", n: "신청 불필요" };
const METHOD_ORDER = ["g", "on", "v", "n"];
const ONLINE_METHODS = new Set(["g", "on"]);

export const isOnline = (service) => (service.m ?? []).some((code) => ONLINE_METHODS.has(code));
// kf: 파이프라인이 지원 형태를 묶음(cash, goods, service, edu, etc)으로 바꿔 넣어 둔다(JSON 파일을 직접 읽지 않는다)
export const kindFamilies = (service) => new Set(service.kf ?? []);
export const methodLabels = (service) => METHOD_ORDER.filter((code) => service.m?.includes(code)).map((code) => METHOD_LABELS[code]);

/** 오늘 날짜를 YYYYMMDD 정수로. 브라우저 기기의 날짜를 쓴다. */
export const todayInt = (d = new Date()) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

const dayNumber = (n) => Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100) / 86400000;

/**
 * 신청 기한 상태. service.dl = { b: 시작일, e: 종료일 } (파이프라인이 연도가 확실한 날짜만 채운다).
 * closed: 종료일이 지남 / upcoming: 시작 전 / open: 종료일이 남음(dday = 남은 일수) / null: 알 수 없음
 */
export function deadlineState(service, today = todayInt()) {
  const { b, e } = service.dl ?? {};
  if (e != null && e < today) return { state: "closed", end: e };
  if (b != null && b > today) return { state: "upcoming", start: b, end: e ?? null };
  if (e != null) return { state: "open", end: e, dday: dayNumber(e) - dayNumber(today) };
  return null;
}

export const isClosed = (service, today) => deadlineState(service, today)?.state === "closed";

export function matchService(service, profile, today = todayInt()) {
  const c = service.c ?? {};

  if (!matchesRegion(service, profile)) return false;
  if (profile.field && service.f !== profile.field) return false;
  if (!profile.showClosed && isClosed(service, today)) return false;
  if (profile.kind && !kindFamilies(service).has(profile.kind)) return false;
  if (profile.onlineOnly && !isOnline(service)) return false;

  if (profile.q) {
    const hay = `${service.n} ${service.s} ${service.t}`;
    if (!hay.includes(profile.q)) return false;
  }

  // 사업자·기관 전용 서비스는 개인 프로필에서 숨긴다
  const individualFlags = (c.p?.length ?? 0) + (c.h?.length ?? 0) > 0;
  if (c.b && !individualFlags && !profile.business) return false;

  // 나이 코드는 실제 요건과 다른 경우가 있어 제외 기준으로 쓰지 않고 findServices 에서 확인 표시만 한다
  if (profile.sex && c.g && !c.g.includes(profile.sex)) return false;
  if (profile.income && c.i && !c.i.includes(profile.income)) return false;
  if (!matchesTraits(c.p, profile.persons, NO_PERSON_TRAIT)) return false;
  if (!matchesTraits(c.h, profile.households, NO_HOUSEHOLD_TRAIT)) return false;
  return true;
}

/**
 * 만 나이 후보. 출생연도만 알면 올해 생일이 지났는지 몰라서 (올해-출생연도-1, 올해-출생연도) 두 경우가 된다.
 * 예전에 저장된 age 값만 있으면 그 값 하나를 쓴다.
 */
export function candidateAges(profile, year = new Date().getFullYear()) {
  const by = profile.birthYear;
  if (Number.isInteger(by) && by >= 1900 && by <= year) {
    const older = year - by;
    return older === 0 ? [0] : [older - 1, older];
  }
  return profile.age != null ? [profile.age] : [];
}

// 입력한 나이가 공공데이터의 나이 코드 범위 밖인지. 후보 나이가 하나라도 범위 안이면 밖이 아니다.
export function ageOutOfRange(service, profile, year) {
  const range = service.c?.a;
  const ages = candidateAges(profile, year);
  if (!ages.length || !range) return false;
  const [lo, hi] = range;
  return ages.every((age) => (lo != null && age < lo) || (hi != null && age > hi));
}

// ---- 일치 이유 -------------------------------------------------------------------------------
// 카드에 "내 조건 중 무엇이 이 지원의 제한 조건과 맞았는지"를 보여준다.
// 틀린 칩이 붙으면 오해를 만들므로, 정책에 실제로 제한이 있고 내 입력이 그 제한에 들어갈 때만 만든다.
//  - 상황·가구: '해당사항없음' 코드가 함께 켜져 있으면 사실상 전체 대상이라 칩을 만들지 않는다. 대상이 너무 많은 것도 제외.
//  - 소득: 구간 5개가 모두 켜져 있으면 제한이 아니다.
const MAX_SPECIFIC_TRAITS = 4;
const INCOME_UPPER = { 1: 50, 2: 75, 3: 100, 4: 200 };
const INCOME_LOWER = { 1: 0, 2: 50, 3: 75, 4: 100, 5: 200 };

/** 소득 구간 목록(연속일 때)을 '중위소득 100% 이하' 같은 말로. 연속이 아니면 null. */
function incomeRuleLabel(list) {
  const s = [...list].sort((x, y) => x - y);
  if (!s.every((v, i) => i === 0 || v === s[i - 1] + 1)) return null;
  const lo = s[0];
  const hi = s[s.length - 1];
  if (lo === 1) return `중위소득 ${INCOME_UPPER[hi]}% 이하`;
  if (hi === 5) return `중위소득 ${INCOME_LOWER[lo]}% 초과`;
  return `중위소득 ${INCOME_LOWER[lo]}~${INCOME_UPPER[hi]}%`;
}

function traitReasons(codes, selected, noneCode, labels, kind) {
  if (!codes?.length || codes.includes(noneCode) || codes.length > MAX_SPECIFIC_TRAITS) return [];
  return selected.filter((code) => codes.includes(code)).map((code) => ({ kind, label: labels[code] }));
}

export function matchReasons(service, profile, year) {
  const c = service.c ?? {};
  const out = [];

  if (profile.region) {
    if (!service.r) {
      if (NATIONWIDE_ORG_TYPES.has(service.ot)) out.push({ kind: "region", label: "전국 공통" });
    } else if (service.r === profile.region) {
      const district = service.g && (!profile.district || service.g === profile.district) ? service.g : "";
      out.push({ kind: "region", label: district ? `${regionLabel(service.r)} ${district}` : `${regionLabel(service.r)} 전체` });
    }
  }

  out.push(...traitReasons(c.p, profile.persons, NO_PERSON_TRAIT, PERSON_TRAITS, "person"));
  out.push(...traitReasons(c.h, profile.households, NO_HOUSEHOLD_TRAIT, HOUSEHOLD_TRAITS, "household"));

  if (profile.income && c.i?.length && c.i.length < 5 && c.i.includes(profile.income)) {
    const label = incomeRuleLabel(c.i);
    if (label) out.push({ kind: "income", label });
  }
  if (profile.sex && c.g?.length === 1 && c.g.includes(profile.sex)) {
    out.push({ kind: "sex", label: profile.sex === "F" ? "여성 대상" : "남성 대상" });
  }
  if (c.a && (c.a[0] != null || c.a[1] != null) && candidateAges(profile, year).length && !ageOutOfRange(service, profile, year)) {
    const [lo, hi] = c.a;
    out.push({ kind: "age", label: lo != null && hi != null ? `만 ${lo}~${hi}세` : lo != null ? `만 ${lo}세 이상` : `만 ${hi}세 이하` });
  }
  return out;
}

// 마감 임박순: 종료일이 가까운 것부터, 기한을 모르는 것은 뒤로(인기순), 마감된 것은 맨 뒤
function deadlineRank(s) {
  const st = s.deadline;
  if (!st) return 1;
  if (st.state === "open") return 0;
  if (st.state === "upcoming") return 1;
  return 2;
}

export function findServices(services, profile, today = todayInt()) {
  const rows = services
    .filter((s) => matchService(s, profile, today))
    .map((s) => ({
      ...s,
      uncertain: Boolean(s.c?.nc),
      ageCheck: ageOutOfRange(s, profile),
      deadline: deadlineState(s, today),
      reasons: matchReasons(s, profile),
    }));
  const byPopular = (a, b) => Number(a.ageCheck) - Number(b.ageCheck) || b.v - a.v;
  if (profile.sort === "deadline") {
    return rows.sort(
      (a, b) =>
        deadlineRank(a) - deadlineRank(b) ||
        (a.deadline?.state === "open" && b.deadline?.state === "open" ? a.deadline.dday - b.deadline.dday : 0) ||
        byPopular(a, b),
    );
  }
  return rows.sort(byPopular);
}

// ---- 같은 이름 묶기 ------------------------------------------------------------------------------
// 같은 이름의 정책이 여러 지자체에 반복된다(전체의 약 1/3). 이름이 같아도 금액·대상은 지역마다 다를 수 있으므로
// 내용을 합치지 않고, 내게 가장 가까운 것을 대표 카드로 보이고 나머지는 "다른 곳"으로 접어 하나하나 열어 볼 수 있게 한다.
//  - 중앙·공공기관 / 광역·교육청 / 그 밖의 지역 기관, 세 단계를 나눠 같은 단계끼리만 묶는다
//    (중앙부처의 전국 사업이 지자체 카드 속에 숨지 않도록).
//  - 이름 앞의 자기 지역명은 '띄어쓰기로 구분될 때만' 뗀다(성북구민안전보험 -> 민안전보험 이 되는 것을 막는다).
//  - 너무 짧은 이름(3글자 이하)은 묶지 않는다.
const TIER_BY_TYPE = { 중앙행정기관: "c", 공공기관: "c", 광역시도: "m", 교육청: "m" };
const MIN_GROUP_NAME = 4;

export function groupKey(service) {
  const tier = TIER_BY_TYPE[service.ot] ?? "l";
  let name = service.n ?? "";
  // 지역 단계의 괄호는 '강남사랑상품권' 같은 지역별 상표라 무시하지만,
  // 중앙·광역 단계의 괄호는 '(기초생활보장수급자)' 처럼 서로 다른 하위 사업을 가르므로 유지한다.
  if (tier === "l") name = name.replace(/\([^)]*\)/g, " ");
  name = name.trim();
  const heads = [service.g, service.r, service.r && regionLabel(service.r), service.r && `${regionLabel(service.r)}시`]
    .filter(Boolean)
    .sort((x, y) => y.length - x.length);
  for (const head of heads) {
    if (name.startsWith(`${head} `)) {
      name = name.slice(head.length).trim();
      break;
    }
  }
  const norm = name.replace(/[\s·ㆍ,.\-_/]/g, "");
  if (norm.length < MIN_GROUP_NAME) return null;
  return `${tier}|${norm}`;
}

// 대표로 삼을 때의 지역 가까움: 내 시·군·구 0, 내 시·도 1, 전국 공통 2, 그 밖 3. 지역을 고르지 않았으면 모두 같다.
function regionRank(service, { region, district }) {
  if (!region) return 0;
  if (!service.r) return 2;
  if (service.r !== region) return 3;
  return district && service.g === district ? 0 : 1;
}

/**
 * findServices 결과를 같은 이름끼리 묶는다. 각 항목은 대표 정책에 others(나머지, 가까운 순)를 붙인 모양이다.
 * 목록 순서는 묶음에서 가장 앞선 구성원의 자리를 따른다(선택한 정렬을 해치지 않는다).
 */
export function groupResults(rows, profile) {
  const byKey = new Map();
  const slots = [];
  rows.forEach((row, index) => {
    const key = groupKey(row);
    if (key === null) {
      slots.push({ members: [row], at: index });
      return;
    }
    let slot = byKey.get(key);
    if (!slot) {
      slot = { members: [], at: index };
      byKey.set(key, slot);
      slots.push(slot);
    }
    slot.members.push(row);
  });

  const closedLast = (s) => (s.deadline?.state === "closed" ? 1 : 0);
  const closer = (a, b) =>
    closedLast(a) - closedLast(b) ||
    regionRank(a, profile) - regionRank(b, profile) ||
    Number(a.ageCheck) - Number(b.ageCheck) ||
    b.reasons.length - a.reasons.length ||
    b.v - a.v;

  return slots
    .sort((a, b) => a.at - b.at)
    .map(({ members }) => {
      const sorted = [...members].sort(closer);
      const [main, ...others] = sorted;
      return { ...main, others };
    });
}
