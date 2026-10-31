"""카드에서 한눈에 볼 정보(지원 형태, 신청 방식, 지원 금액 문구)를 뽑는다.

금액은 틀리면 거짓 정보가 되므로, 같은 문장에 지원·지급 같은 말이 있고 비용·소득·재산을 뜻하는 말이 없으며
서로 다른 금액이 딱 하나일 때만 원문 그대로 발췌한다. 애매하면 뽑지 않는다.
"""
import json
import re
from pathlib import Path

KINDS = json.loads((Path(__file__).resolve().parents[2] / "web" / "src" / "supportKinds.json").read_text(encoding="utf-8"))
GENERIC_LABEL = "기타"
MAX_KINDS = 3

METHOD_CODES = {"정부24온라인신청": "g", "기타 온라인신청": "on", "방문신청": "v", "신청불필요": "n"}


def support_kinds(raw: str | None) -> list[str]:
    """'현금||현금(감면)' -> ['현금', '요금·세금 감면']. 모르는 값은 '기타'. 다른 값이 있으면 일반 '기타'는 뺀다."""
    labels: list[str] = []
    for part in (raw or "").split("||"):
        part = part.strip()
        if not part:
            continue
        label = KINDS.get(part, {}).get("label", GENERIC_LABEL)
        if label not in labels:
            labels.append(label)
    if len(labels) > 1 and GENERIC_LABEL in labels:
        labels.remove(GENERIC_LABEL)
    return labels[:MAX_KINDS]


def kind_families(raw: str | None) -> list[str]:
    """필터용 묶음 코드(cash, goods, service, edu, etc). 모르는 값은 etc."""
    families: list[str] = []
    for part in (raw or "").split("||"):
        part = part.strip()
        if part:
            family = KINDS.get(part, {}).get("family", "etc")
            if family not in families:
                families.append(family)
    return families


def apply_methods(raw: str | None) -> list[str]:
    """신청 방식 코드. g: 정부24 온라인, on: 기타 온라인, v: 방문, n: 신청 불필요. '직접입력'(자유 문장)은 판단하지 않는다."""
    codes: list[str] = []
    for part in (raw or "").split("||"):
        code = METHOD_CODES.get(part.strip())
        if code and code not in codes:
            codes.append(code)
    return codes


# ---- 금액 --------------------------------------------------------------------------------
_KEYWORD = r"(?:월\s*최대|연\s*최대|매월|연간|1인당|1인|가구당|세대당|인당|1회당|1회|1건당|건당|1명당|월|연|최대|최고)"
_NUMBER = r"\d[\d,]*(?:\.\d+)?\s*(?:억|천만|백만|만|천)?\s*원"
# 금액 뒤에 '~56만원' 처럼 범위가 이어지면 최저값만 보여주게 되므로 제외한다
NUMBER = re.compile(_NUMBER)
AMOUNT = re.compile(rf"({_KEYWORD}\s*(?:약\s*)?{_NUMBER}(?:\s*(?:이내|이하|까지|씩|한도|범위\s*내))?)(?!\s*[~∼]|\s*-\s*\d)")
BENEFIT_WORD = re.compile(r"지원|지급|보조|감면|장려금|수당|급여|장학|보상금|위로금|축하금|바우처|포인트|환급|보전")
# 내가 내는 돈이거나 자격 기준(소득·재산)이거나 금액을 깎는 말이면 지원금이 아니다
NOT_BENEFIT_WORD = re.compile(
    r"소득|재산|수강료|이용료|사용료|참가비|입장료|요금|보증금|자부담|본인\s*부담|납부|보험료|회비|수수료|임대료|월세|연체|이자율|차감|공제|초과|미만|이상인|대출|융자|한도액"
)
# 특정 지역·가구 규모·대상에만 해당하는 예시이거나 금액이 달라진다는 뜻의 말이 같은 문장에 있으면 대표 금액으로 보여줄 수 없다
LIMITED_WORD = re.compile(
    r"급지|\d\s*인\s*가구|\d\s*인가구|\d\s*인\s*기준|(?:광역시|특별시|서울|도|시|군|구)\s*기준|예시|예:|예\)|예를\s*들어"
    r"|지역별|차등|등급별|단계별|구간별|소득별|연령별|유형별|대상별|가구원\s*수|개월\s*차|학년별|종류별"
)
CLAUSE_SPLIT = re.compile(r"[\n\r]|[○●•▪※ㆍ;]|\s-\s|\s\d\)\s|\.\s")
MAX_SNIPPET = 28


def _tidy(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(rf"^({_KEYWORD})(\d)", r"\1 \2", text)  # '최대1.5억원' -> '최대 1.5억원'


def amount_snippet(text: str | None) -> str | None:
    """지원내용에서 '월 20만원' 같은 금액 문구 하나를 원문 그대로 뽑는다. 확실하지 않으면 None.

    지원·지급 문장 안에 나오는 금액을 앞말(월·최대 등)이 없는 것까지 모두 세어서, 서로 다른 금액이
    딱 하나일 때만 뽑는다('월 50만원 또는 40만원'처럼 뒤의 금액이 빠지는 일을 막는다).
    """
    all_amounts: set[str] = set()
    labeled: dict[str, str] = {}
    for clause in CLAUSE_SPLIT.split(text or ""):
        if not clause.strip() or clause.lstrip().startswith("*"):
            continue
        if not BENEFIT_WORD.search(clause) or NOT_BENEFIT_WORD.search(clause):
            continue
        if LIMITED_WORD.search(clause):
            return None  # 금액이 특정 기준의 예시이거나 대상에 따라 달라진다. 이 정책은 금액 칩을 만들지 않는다
        for number in NUMBER.findall(clause):
            all_amounts.add(re.sub(r"\s+", "", number))
        for m in AMOUNT.findall(clause):
            labeled.setdefault(re.sub(r"\s+", "", m), _tidy(m))
    if len(all_amounts) != 1 or len(labeled) != 1:
        return None
    snippet = next(iter(labeled.values()))
    return snippet if len(snippet) <= MAX_SNIPPET else None
