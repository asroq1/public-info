"""serviceDetail 응답에서 정책 페이지에 쓸 정보(구비서류·신청 주소·근거 법령)를 정리한다.

공공데이터 값은 형식이 제각각이므로, 링크로 쓰는 값은 반드시 http(s) 주소만 통과시킨다.
"""
import re
from urllib.parse import urlparse

PLACEHOLDERS = {"", "-", ".", "없음", "해당없음", "해당 없음", "해당사항없음", "해당 사항 없음", "N/A", "n/a"}
MAX_URL_LEN = 300
MAX_LAWS = 8
MAX_LOCAL_RULES = 5

# 스킴이 빠진 도메인 형태: www.example.go.kr/path, example.or.kr
_BARE_DOMAIN = re.compile(r"^(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#][^\s]*)?$", re.I)


def normalize_apply_url(raw: str | None) -> str | None:
    """신청 사이트 주소를 안전한 https/http 주소로 정리한다. 믿을 수 없는 값은 None."""
    url = (raw or "").strip()
    if not url or len(url) > MAX_URL_LEN or re.search(r"[\s<>\"'`\\]", url):
        return None
    if "://" not in url:
        if not _BARE_DOMAIN.match(url):
            return None
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or "." not in parsed.netloc or parsed.username or parsed.password:
        return None
    return url


_LEADING_MARK = re.compile(r"^[○●◦ㆍ·•▪■※\-*]+\s*")


def clean_lines(raw: str | None) -> list[str]:
    """줄 단위로 나누되 빈 값·자리표시 값을 제거한다.

    목록으로 다시 그리므로 줄 앞의 글머리 기호(○, - 등)만 걷어내고 문구는 가공하지 않는다.
    """
    out = []
    for line in (raw or "").replace("\r", "").split("\n"):
        line = _LEADING_MARK.sub("", line.strip()).strip()
        if line and line not in PLACEHOLDERS:
            out.append(line)
    return out


def law_names(raw: str | None, limit: int) -> list[str]:
    """'법령명(제n조, 제n항)||법령명(제m조…)' 형태에서 법 이름만 중복 없이 뽑는다."""
    seen: dict[str, None] = {}
    for part in (raw or "").split("||"):
        name = re.sub(r"\(.*", "", part).strip()
        if name and name not in PLACEHOLDERS:
            seen.setdefault(name)
    return list(seen)[:limit]


def build_detail(row: dict | None) -> dict:
    """정책 페이지용 상세 정보. 값이 없는 항목은 키를 생략한다."""
    if not row:
        return {}
    out: dict = {}
    docs = clean_lines(row.get("구비서류"))
    if docs:
        out["docs"] = docs
    official = clean_lines(row.get("공무원확인구비서류"))
    if official:
        out["docs_official"] = official
    self_check = clean_lines(row.get("본인확인필요구비서류"))
    if self_check:
        out["docs_self"] = self_check
    url = normalize_apply_url(row.get("온라인신청사이트URL"))
    if url:
        out["apply_url"] = url
    laws = law_names(row.get("법령"), MAX_LAWS)
    if laws:
        out["laws"] = laws
    rules = law_names(row.get("자치법규"), MAX_LOCAL_RULES)
    if rules:
        out["local_rules"] = rules
    return out
