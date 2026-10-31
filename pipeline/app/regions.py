"""소관기관명에서 정책의 지역(시·도, 시·군·구)을 알아낸다.

행정구역은 바뀔 수 있다(예: 광주광역시와 전라남도가 '전남광주통합특별시'로 합쳐짐).
그래서 시·도 목록을 코드에 적어 두지 않고, 데이터의 '광역시도' 유형 기관명에서 뽑는다.

반환하는 지역은 확실한 경우만이다. 애매하면 (None, None) 이고, 중앙행정기관·공공기관은 원래 지역이 없다.
"""
import re
from collections import defaultdict

# '경기도 수원시', '서울특별시 강남구', '전남광주통합특별시 광산구' 처럼 시·도와 시군구가 공백으로 나뉜 형태
SIGUNGU_ORG = re.compile(r"^(\S+(?:특별시|광역시|특별자치시|특별자치도|도))\s+(\S+(?:시|군|구))$")
NATIONWIDE_TYPES = {"중앙행정기관", "공공기관"}
# 시·도 약칭 중 이름 앞 두 글자로는 알 수 없는 것들(해당 시·도가 데이터에 있을 때만 쓴다)
SIDO_ABBREVIATIONS = {"충북": "충청북도", "충남": "충청남도", "경북": "경상북도", "경남": "경상남도", "광주": "전남광주통합특별시"}
# 이름 앞의 법인 표시는 지역 판단에서 뺀다: (재)충북문화재단, 재단법인영등포구미래교육재단
LEGAL_PREFIX = re.compile(r"^(?:\((?:재|사|주)\)|㈜|재단법인|사단법인|\s)+")


class RegionResolver:
    def __init__(self, services: list[dict]):
        """services: serviceList 응답 행들(소관기관명, 소관기관유형 필요)."""
        self.sidos: set[str] = set()
        self.districts: dict[str, set[str]] = defaultdict(set)  # 시도 -> 시군구들
        for s in services:
            org, kind = s.get("소관기관명") or "", s.get("소관기관유형")
            if kind == "광역시도":
                self.sidos.add(org)
            elif kind == "시군구" and (m := SIGUNGU_ORG.match(org)):
                self.sidos.add(m.group(1))
                self.districts[m.group(1)].add(m.group(2))
        # 시군구 이름 -> 그 이름을 쓰는 시도들 (중구·동구처럼 여러 시도에 있는 이름을 가려내기 위해)
        self.owners: dict[str, set[str]] = defaultdict(set)
        for sido, names in self.districts.items():
            for name in names:
                self.owners[name].add(sido)
        # 긴 이름부터 찾아야 '강서구' 안의 '서구' 에 잘못 걸리지 않는다
        self._names_by_len = sorted(self.owners, key=len, reverse=True)
        self._sido_aliases = self._build_sido_aliases()

    def _build_sido_aliases(self) -> dict[str, str]:
        """약칭 -> 시도. 앞 두 글자(서울, 부산, 경기, 전북…)가 유일하면 쓰고, 충북·경남 같은 약칭을 더한다."""
        by_prefix: dict[str, set[str]] = defaultdict(set)
        for sido in self.sidos:
            by_prefix[sido[:2]].add(sido)
        aliases = {k: next(iter(v)) for k, v in by_prefix.items() if len(v) == 1}
        for abbr, full in SIDO_ABBREVIATIONS.items():
            if full in self.sidos:
                aliases[abbr] = full
        return aliases

    def resolve(self, org: str | None, kind: str | None) -> tuple[str | None, str | None]:
        org = org or ""
        if kind in NATIONWIDE_TYPES:
            return None, None
        if kind == "광역시도":
            return (org, None) if org in self.sidos else (None, None)
        if kind == "시군구":
            m = SIGUNGU_ORG.match(org)
            return (m.group(1), m.group(2)) if m else (None, None)
        if kind == "교육청":
            sido = org.removesuffix("교육청")
            return (sido, None) if sido in self.sidos else (None, None)
        return self._from_name(org)

    def _from_name(self, org: str) -> tuple[str | None, str | None]:
        """공기업·출연기관 등: 이름 안의 시·도 또는 시군구 이름으로 추정한다."""
        stripped = LEGAL_PREFIX.sub("", org)
        sido = next((s for s in self.sidos if s in org), None)
        for name in self._names_by_len:
            if name not in org:
                continue
            owners = self.owners[name]
            if sido:
                return (sido, name) if sido in owners else (sido, None)
            if len(owners) == 1:
                return next(iter(owners)), name
            return None, None  # '중구시설관리공단' 처럼 어느 시도인지 알 수 없다
        if sido:
            return sido, None
        # 이름이 약칭이나 시군구 이름(시·군·구를 뗀 형태)으로 '시작'할 때만 인정한다: 전남신용보증재단, 시흥도시공사.
        # 후보가 둘 이상이면(예: 광주문화재단 = 전남·광주? 경기 광주시?) 추측하지 않는다.
        hits: set[tuple[str, str | None]] = set()
        for abbr, full in self._sido_aliases.items():
            if stripped.startswith(abbr):
                hits.add((full, None))
        for name, owners in self.owners.items():
            if len(name) >= 3 and stripped.startswith(name[:-1]):
                hits.update((owner, name) for owner in owners)
        return next(iter(hits)) if len(hits) == 1 else (None, None)

    def region_list(self) -> list[dict]:
        """화면의 지역·시군구 선택지. 시군구가 없는 시도(세종 등)는 districts 가 빈 목록."""
        return [{"name": s, "districts": sorted(self.districts.get(s, ()))} for s in sorted(self.sidos)]
