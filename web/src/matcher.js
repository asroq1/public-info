// 프로필과 서비스의 지원조건(c)을 비교해 "대상이 될 수 있는" 서비스를 추린다.
// 자격 판정이 아니라 후보 추림이다. 조건 정보가 없는 서비스는 통과시키되 uncertain 으로 표시한다.

export const REGION_NAMES = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도",
  제주: "제주특별자치도",
};

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
  age: null, birthYear: null, household: null, monthlyIncome: "", sex: null, income: null, region: "",
  persons: [], households: [], business: false, field: "", q: "", showClosed: false, sort: "popular",
});

function matchesRegion(service, region) {
  if (!region) return true;
  if (NATIONWIDE_ORG_TYPES.has(service.ot)) return true;
  return (service.o ?? "").includes(REGION_NAMES[region] ?? region);
}

// 선택한 특성과 서비스 대상 코드가 겹치는지. 선택이 없으면 "해당사항없음" 코드를 기준으로 본다.
function matchesTraits(serviceCodes, selected, noneCode) {
  if (!serviceCodes?.length) return true; // 제한 정보가 없으면 통과
  const wanted = selected.length ? selected : [noneCode];
  return wanted.some((code) => serviceCodes.includes(code));
}

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

  if (!matchesRegion(service, profile.region)) return false;
  if (profile.field && service.f !== profile.field) return false;
  if (!profile.showClosed && isClosed(service, today)) return false;

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
