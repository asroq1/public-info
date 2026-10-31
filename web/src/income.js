// 기준 중위소득(월, 원). 출처: 보건복지부 기준 중위소득 표
// https://www.mohw.go.kr/menu.es?mid=a10708010900
// 매년 8월 1일까지 다음 해 값이 공표된다. 새 값이 나오면 이 표에 한 줄을 추가하면 된다.
export const MEDIAN_INCOME = {
  2026: [2564238, 4199292, 5359036, 6494738, 7556719, 8555952, 9515150],
  2027: [2736042, 4480645, 5718091, 6929885, 8063019, 9129201, 10152665],
};

export const MAX_HOUSEHOLD = 7; // 7인 이상은 7인 기준으로 계산한다

// 소득 구간 번호(1~5)별 기준 중위소득 대비 상한 비율. 5번(200% 초과)은 상한이 없다.
const UPPER_RATIOS = [0.5, 0.75, 1.0, 2.0];

/** 적용할 표의 연도. 값이 공표된 가장 최근 연도까지만 쓴다. */
export function tableYear(year = new Date().getFullYear()) {
  const years = Object.keys(MEDIAN_INCOME).map(Number).sort((a, b) => a - b);
  return Math.min(Math.max(year, years[0]), years[years.length - 1]);
}

export function medianIncome(household, year) {
  // 가구원 수를 모르는 것(null, 빈 값)을 1인 가구로 착각하지 않도록 먼저 걸러낸다
  if (household === null || household === undefined || household === "") return null;
  const num = Math.trunc(Number(household));
  if (!Number.isFinite(num) || num < 1) return null;
  return MEDIAN_INCOME[tableYear(year)][Math.min(num, MAX_HOUSEHOLD) - 1];
}

/** 구간 1~4의 월 소득 상한(원). 가구원 수를 모르면 null. */
export function bracketLimits(household, year) {
  const median = medianIncome(household, year);
  if (!median) return null;
  return UPPER_RATIOS.map((r) => Math.round(median * r));
}

/** 월 가구소득(만원)이 기준 중위소득의 몇 %인지. 계산할 수 없으면 null. */
export function incomePercent(household, monthlyManwon, year) {
  const median = medianIncome(household, year);
  const monthly = Number(monthlyManwon);
  if (!median || monthlyManwon === "" || monthlyManwon == null || !Number.isFinite(monthly) || monthly < 0) return null;
  return (monthly * 10000 * 100) / median;
}

/** 월 가구소득(만원)으로 소득 구간(1~5)을 정한다. 입력이 부족하면 null. */
export function incomeBracket(household, monthlyManwon, year) {
  const pct = incomePercent(household, monthlyManwon, year);
  if (pct == null) return null;
  const idx = UPPER_RATIOS.findIndex((r) => pct <= r * 100 + 1e-9);
  return idx === -1 ? 5 : idx + 1;
}

/** 원 단위를 '649만원' 형태로. 소수는 반올림한다(평균·기준 금액 표시용). */
export const manwon = (won) => `${Math.round(won / 10000).toLocaleString("ko-KR")}만원`;

/**
 * 구간 상한 표시용: 소수는 내림한다. 사용자가 정수 만원으로 입력하므로,
 * '324만원 이하'라고 쓰면 324를 넣었을 때와 계산 결과(구간)가 항상 일치한다.
 */
export const manwonFloor = (won) => `${Math.floor(won / 10000 + 1e-9).toLocaleString("ko-KR")}만원`;
