"""공공데이터 '전화문의' 값을 읽기 좋은 문의처 목록으로 바꾼다.

원문은 '부서명/전화번호' 를 '||' 로 이어 붙인 형태다: '복지정책과/052-229-3426||울산지역사회서비스지원단/052-243-4800'.
전화 걸기 링크는 번호로 읽히는 것만 만든다. 지역번호가 없거나 자리표시 값('000-0000', '-')이면 걸 수 없는 번호라서
링크를 만들지 않고, 자리표시 값은 아예 보여주지 않는다. 번호를 추측해서 보정하지는 않는다(붙어 있는 숫자에 하이픈만 넣는다).
"""
import re

# 이미 형식을 갖춘 번호: 02-123-4567, 031-8008-4104, 1533-3131, 132
PHONE = re.compile(r"^(?:0\d{1,2}-\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4}|1\d{2,3})$")
# '055)333-8175' 처럼 지역번호 뒤에 괄호가 닫힌 표기
PAREN_AREA = re.compile(r"^(0\d{1,2})\)\s*")
PLACEHOLDER = re.compile(r"^[\s\-0()]*$")
JOINER = "||"


def _format_digits(digits: str) -> str | None:
    """하이픈 없이 붙어 있는 번호에 하이픈을 넣는다. 자리 수가 맞지 않으면 None."""
    if re.fullmatch(r"1[5-9]\d{6}", digits):
        return f"{digits[:4]}-{digits[4:]}"
    if digits.startswith("02") and len(digits) in (9, 10):
        return f"02-{digits[2:-4]}-{digits[-4:]}"
    if re.fullmatch(r"0(?:[3-6]\d|70|1\d)\d{6,7}", digits):
        return f"{digits[:3]}-{digits[3:-4]}-{digits[-4:]}"
    return None


def _clean_number(num: str) -> tuple[str | None, str | None]:
    """(보여줄 번호, tel 링크용 숫자). 번호가 없거나 자리표시 값이면 (None, None)."""
    num = PAREN_AREA.sub(r"\1-", num.strip())
    if PLACEHOLDER.fullmatch(num):
        return None, None
    if PHONE.fullmatch(num):
        return num, re.sub(r"\D", "", num)
    if re.fullmatch(r"\d+", num):
        formatted = _format_digits(num)
        if formatted:
            return formatted, num
    return num, None


def parse_contacts(raw: str | None) -> list[dict]:
    """[{name, phone, tel}] . phone 은 화면에 보일 번호(없을 수 있음), tel 은 전화 걸기용 숫자(없으면 링크를 만들지 않음)."""
    contacts = []
    for part in (raw or "").split(JOINER):
        part = part.strip()
        if not part:
            continue
        if "/" in part:
            name, num = part.rsplit("/", 1)
        elif PHONE.fullmatch(part):
            name, num = "", part
        else:
            name, num = part, ""
        name, num = name.strip(), num.strip()
        if num and not re.search(r"\d", num) and not PLACEHOLDER.fullmatch(num):
            # '해당지역 시군구청/관할 지자체' 처럼 번호 자리에 글이 들어 있으면 번호가 아니라 안내 문구다
            name = name if num == name else f"{name} · {num}".strip(" ·")
            num = ""
        phone, tel = _clean_number(num)
        if not name and not phone:
            continue
        contacts.append({"name": name, "phone": phone, "tel": tel})
    return contacts
