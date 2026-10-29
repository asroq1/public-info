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


# --- 페이지 표기용 -------------------------------------------------------

PERSON_LABELS = {
    "0301": "예비부모·난임", "0302": "임산부", "0303": "출산·입양",
    "0313": "농업인", "0314": "어업인", "0315": "축산업인", "0316": "임업인",
    "0317": "초등학생", "0318": "중학생", "0319": "고등학생", "0320": "대학생·대학원생",
    "0326": "근로자·직장인", "0327": "구직자·실업자", "0328": "장애인",
    "0329": "국가보훈대상자", "0330": "질병·질환자",
}
HOUSEHOLD_LABELS = {
    "0401": "다문화가족", "0402": "북한이탈주민", "0403": "한부모·조손가정",
    "0404": "1인가구", "0411": "다자녀가구", "0412": "무주택세대",
    "0413": "신규전입", "0414": "확대가족",
}
INCOME_LABELS = {
    1: "중위소득 50% 이하", 2: "중위소득 51~75%", 3: "중위소득 76~100%",
    4: "중위소득 101~200%", 5: "중위소득 200% 초과",
}
SEX_LABELS = {"M": "남성", "F": "여성"}


def describe_conditions(cond: dict) -> list[tuple[str, str]]:
    """압축 조건 -> [(항목, 설명)]. 제한이 있는 항목만 돌려준다."""
    rows: list[tuple[str, str]] = []

    if "a" in cond:
        lo, hi = cond["a"]
        if lo is not None and hi is not None:
            text = f"만 {lo}세 이상 {hi}세 이하"
        elif lo is not None:
            text = f"만 {lo}세 이상"
        else:
            text = f"만 {hi}세 이하"
        rows.append(("나이", text))

    sexes = cond.get("g", [])
    if len(sexes) == 1:
        rows.append(("성별", f"{SEX_LABELS[sexes[0]]}"))

    incomes = cond.get("i", [])
    if incomes and len(incomes) < len(INCOME_LABELS):
        rows.append(("소득", ", ".join(INCOME_LABELS[i] for i in incomes)))

    for key, none_code, labels, title in (
        ("p", "0322", PERSON_LABELS, "해당 상황"),
        ("h", "0410", HOUSEHOLD_LABELS, "가구 상황"),
    ):
        codes = cond.get(key, [])
        if codes and none_code not in codes:
            names = [labels[c] for c in codes if c in labels]
            if names:
                rows.append((title, ", ".join(names)))

    individual = bool(cond.get("p") or cond.get("h"))
    if cond.get("b") and not individual:
        rows.append(("대상", "사업자·기관"))
    return rows
