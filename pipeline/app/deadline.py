"""신청기한 문구에서 접수 시작일·종료일을 뽑는다.

원칙: 지금도 신청할 수 있는 정책을 마감으로 잘못 숨기는 것이, 지난 정책이 보이는 것보다 더 나쁘다.
그래서 아래 경우에만 날짜를 돌려주고, 조금이라도 애매하면 빈 값(=마감 판단 안 함)을 돌려준다.

- 연도가 들어간 날짜만 쓴다(연도 없는 '3.1~3.15' 는 매년 반복일 수 있어 제외).
- '매년', '연중', '상시', '정기' 같은 반복 표현이 있으면 날짜가 있어도 제외한다.
- 날짜가 하나뿐이면 '까지·마감' 이 붙은 경우에만 종료일로 본다.

반환: {"b": 시작일(YYYYMMDD), "e": 종료일(YYYYMMDD)} 중 알 수 있는 것만. 모르면 {}.
"""
import calendar
import re
from datetime import date

NO_DEADLINE_TYPES = {"상시신청", "접수기관별상이"}

# 신청 기한이 아니라 사업·보장·교육 기간 등을 적은 문구. 이런 날짜로는 마감을 판단하지 않는다.
NOT_APPLICATION = re.compile(r"보장\s*기간|보험\s*기간|사업\s*기간|운영\s*기간|지원\s*기간|지급\s*기간|교육\s*기간|훈련\s*기간|활동\s*기간|근무\s*기간|대여\s*기간|이용\s*기간")

RECURRING = re.compile(
    r"매년|연중|상시|수시|정기|분기|매월|매주|매달|월별|연\s*\d\s*회|반기|상반기|하반기|연초|연말|계속|항시|해마다|연간|사업\s*종료\s*시"
)
# 연도(선택) + 월 + 일(선택). 연도가 없는 토큰은 앞 날짜의 연도를 이어받을 때만 쓴다.
TOKEN = re.compile(r"(?:(20\d{2})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(?:(\d{1,2})\s*일?)?")
RANGE_MARK = re.compile(r"[~∼〜–]\s*$|\s-\s*$|부터\s*$")


def _valid(y: int, m: int, d: int) -> bool:
    return 2000 <= y <= 2100 and 1 <= m <= 12 and 1 <= d <= calendar.monthrange(y, m)[1]


def parse_deadline(text: str | None, kind: str | None = None) -> dict:
    text = " ".join((text or "").split())
    if not text or kind in NO_DEADLINE_TYPES or RECURRING.search(text) or NOT_APPLICATION.search(text):
        return {}

    dates: list[tuple[int, int, int | None, int, int]] = []  # (y, m, d|None, 토큰시작, 토큰끝)
    year = None
    for m in TOKEN.finditer(text):
        y_s, mo_s, d_s = m.groups()
        month = int(mo_s)
        day = int(d_s) if d_s else None
        if y_s:
            year = int(y_s)
        else:
            # 연도 없는 토큰은 바로 앞이 범위 표시(~)이고 앞선 날짜의 연도가 있을 때만 인정한다
            if year is None or not RANGE_MARK.search(text[: m.start()]):
                continue
        if not (1 <= month <= 12) or (day is not None and not (1 <= day <= 31)):
            continue
        dates.append((year, month, day, m.start(), m.end()))
    if not dates:
        return {}

    def start_of(t):
        y, mo, d, *_ = t
        return date(y, mo, d or 1) if _valid(y, mo, d or 1) else None

    def end_of(t):
        y, mo, d, *_ = t
        dd = d or calendar.monthrange(y, mo)[1] if 1 <= mo <= 12 else None
        return date(y, mo, dd) if dd and _valid(y, mo, dd) else None

    out: dict = {}
    if len(dates) == 1:
        tail = text[dates[0][4]:]
        # '2026.3.3 ~ 자금 소진 시' 처럼 시작일만 있는 경우는 종료일을 모른다
        if re.match(r"[\s.]*([~∼〜–]|부터)", tail):
            s = start_of(dates[0])
            return {"b": int(s.strftime("%Y%m%d"))} if s else {}
        if re.match(r"[\s.]*(까지|마감|전까지|이내)", tail):
            e = end_of(dates[0])
            return {"e": int(e.strftime("%Y%m%d"))} if e else {}
        return {}

    starts = [start_of(t) for t in dates]
    ends = [end_of(t) for t in dates]
    if any(x is None for x in starts + ends):
        return {}  # 존재하지 않는 날짜가 섞여 있으면 믿지 않는다
    s, e = min(starts), max(ends)
    if e < s:
        return {}
    return {"b": int(s.strftime("%Y%m%d")), "e": int(e.strftime("%Y%m%d"))}


def _to_date(n: int) -> date:
    return date(n // 10000, n // 100 % 100, n % 100)


def fmt(n: int) -> str:
    """20260417 -> '2026.04.17'"""
    return f"{n // 10000}.{n // 100 % 100:02d}.{n % 100:02d}"


def status(dl: dict | None, today: int) -> dict:
    """오늘(YYYYMMDD) 기준 상태. {} 이면 표시할 기한 정보가 없다.

    closed: 종료일이 지남 / upcoming: 시작일 전 / open: 종료일이 아직 남음(dday = 남은 일수)
    """
    dl = dl or {}
    b, e = dl.get("b"), dl.get("e")
    if e is not None and e < today:
        return {"state": "closed", "end": e, "end_fmt": fmt(e)}
    if b is not None and b > today:
        out = {"state": "upcoming", "start": b, "start_fmt": fmt(b)}
        if e is not None:
            out.update(end=e, end_fmt=fmt(e))
        return out
    if e is not None:
        return {"state": "open", "end": e, "end_fmt": fmt(e), "dday": (_to_date(e) - _to_date(today)).days}
    return {}
