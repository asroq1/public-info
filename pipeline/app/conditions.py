"""supportConditions 응답(JAxxxx 코드)을 매칭용 구조로 변환한다.

코드표 출처: data.go.kr '행정안전부_대한민국 공공서비스(혜택) 정보' 출력결과 표.
값이 "Y" 이면 해당 조건의 사람이 대상이 될 수 있다는 뜻이다.
"""

SEX_CODES = {"JA0101": "M", "JA0102": "F"}
INCOME_CODES = {"JA0201": 1, "JA0202": 2, "JA0203": 3, "JA0204": 4, "JA0205": 5}

# 개인 상황(JA03xx). JA0322 = 해당사항없음
PERSON_PREFIX = "JA03"
# 가구 상황(JA04xx). JA0410 = 해당사항없음
HOUSEHOLD_PREFIX = "JA04"
# 사업자·기관 대상(JA11xx, JA12xx, JA21xx, JA22xx)
BUSINESS_PREFIXES = ("JA11", "JA12", "JA21", "JA22")

AGE_UNBOUNDED = 120


def _flagged(row: dict, prefix: str) -> list[str]:
    return sorted(k for k, v in row.items() if k.startswith(prefix) and v == "Y")


def parse_conditions(row: dict) -> dict:
    """원본 한 행 -> 압축 조건. 값이 없는 키는 생략한다(생략 = 제한 정보 없음).

    a: [최소나이, 최대나이]  g: 성별  i: 소득구간(1~5)  p: 개인상황  h: 가구상황
    b: 1 이면 사업자·기관 대상 코드가 있음  nc: 1 이면 조건 정보가 전혀 없음
    """
    out: dict = {}

    start, end = row.get("JA0110"), row.get("JA0111")
    lo = start if isinstance(start, (int, float)) and start > 0 else None
    hi = end if isinstance(end, (int, float)) and end > 0 and end < AGE_UNBOUNDED else None
    if lo is not None or hi is not None:
        out["a"] = [lo, hi]

    sexes = [v for k, v in SEX_CODES.items() if row.get(k) == "Y"]
    if sexes:
        out["g"] = sexes

    incomes = [v for k, v in INCOME_CODES.items() if row.get(k) == "Y"]
    if incomes:
        out["i"] = incomes

    person = _flagged(row, PERSON_PREFIX)
    if person:
        out["p"] = [c[2:] for c in person]

    household = _flagged(row, HOUSEHOLD_PREFIX)
    if household:
        out["h"] = [c[2:] for c in household]

    if any(_flagged(row, p) for p in BUSINESS_PREFIXES):
        out["b"] = 1

    if not any(k in out for k in ("a", "g", "i", "p", "h", "b")):
        out["nc"] = 1
    return out
