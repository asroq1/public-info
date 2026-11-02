import json
import re
from pathlib import Path

import pytest

from app.contact import parse_contacts

FULL = Path(__file__).resolve().parents[1] / "build" / "full.json"


def test_splits_entries_on_double_bar():
    got = parse_contacts("복지정책과/052-229-3426||울산지역사회서비스지원단/052-243-4800")
    assert got == [
        {"name": "복지정책과", "phone": "052-229-3426", "tel": "0522293426"},
        {"name": "울산지역사회서비스지원단", "phone": "052-243-4800", "tel": "0522434800"},
    ]


@pytest.mark.parametrize(
    "raw,phone,tel",
    [
        ("부서/1533-3131", "1533-3131", "15333131"),
        ("법률상담/132", "132", "132"),
        ("부서/1366", "1366", "1366"),
        ("남구청노인장애인과/0522266936", "052-226-6936", "0522266936"),      # 붙어 있는 번호에는 하이픈만 넣는다
        ("광진구 교육지원과/024507168", "02-450-7168", "024507168"),
        ("서울부서/0226703401", "02-2670-3401", "0226703401"),
        ("신용회복위원회/16005500", "1600-5500", "16005500"),
        ("김해시 축산업협동조합/055)333-8175", "055-333-8175", "0553338175"),  # 지역번호 뒤 괄호
    ],
)
def test_number_formats_become_dialable(raw, phone, tel):
    (c,) = parse_contacts(raw)
    assert (c["phone"], c["tel"]) == (phone, tel)


@pytest.mark.parametrize("raw", ["해당지역 보건소/000-0000", "해당지역 시군구청/0000000000", "주소지 관할 보건소/-", "시군별 담당부서/()", "해당지역 시군구청 산림부서/000"])
def test_placeholder_numbers_are_dropped_but_name_stays(raw):
    (c,) = parse_contacts(raw)
    assert c["phone"] is None and c["tel"] is None and c["name"]


@pytest.mark.parametrize("raw", ["복지정책과/879-5854", "금연클리닉/054-840-5963,5893", "남부교육지원청/051-6400-248", "제주120만덕콜센터/064-120"])
def test_numbers_that_cannot_be_dialed_are_shown_as_is_without_link(raw):
    (c,) = parse_contacts(raw)
    assert c["tel"] is None and c["phone"] == raw.rsplit("/", 1)[1]


def test_name_with_slash_uses_last_slash_as_number():
    (c,) = parse_contacts("보건/복지과/02-123-4567")
    assert c == {"name": "보건/복지과", "phone": "02-123-4567", "tel": "021234567"}


def test_words_in_the_number_slot_are_kept_as_text_not_a_phone():
    assert parse_contacts("해당지역 시군구청/관할 지자체") == [{"name": "해당지역 시군구청 · 관할 지자체", "phone": None, "tel": None}]
    assert parse_contacts("해당지역 보건소/해당지역 보건소") == [{"name": "해당지역 보건소", "phone": None, "tel": None}]


def test_text_without_number_is_a_name_only_entry():
    (c,) = parse_contacts("관할 지자체 문의")
    assert c == {"name": "관할 지자체 문의", "phone": None, "tel": None}


def test_empty_and_blank_parts_are_skipped():
    assert parse_contacts(None) == [] and parse_contacts("") == [] and parse_contacts(" || ") == []
    assert len(parse_contacts("a/02-123-4567||")) == 1


@pytest.mark.skipif(not FULL.exists(), reason="실데이터(build/full.json)가 없으면 건너뜀")
def test_real_data_invariants():
    """모든 실제 문의처에 대해: 개수가 같고, 링크 번호는 원문 숫자 그대로이며, 자리표시 값에는 링크가 없다."""
    rows = json.loads(FULL.read_text(encoding="utf-8"))
    entries = linked = 0
    for r in rows:
        raw = r.get("전화문의") or ""
        parts = [p.strip() for p in raw.split("||") if p.strip()]
        got = parse_contacts(raw)
        assert len(got) == len(parts), raw          # 한 건도 빠지거나 늘지 않는다
        for part, c in zip(parts, got):
            entries += 1
            num = part.rsplit("/", 1)[1] if "/" in part else ""
            if c["tel"]:
                linked += 1
                assert c["tel"] == re.sub(r"\D", "", num), part   # 숫자를 바꾸거나 만들어 내지 않는다
                assert set(c["tel"]) != {"0"}
            if c["phone"]:
                assert re.search(r"\d", num), part      # 숫자가 없는 글은 번호로 내보내지 않는다
                assert re.sub(r"\D", "", c["phone"]) == re.sub(r"\D", "", re.sub(r"^(0\d{1,2})\)", r"\1", num)), part
            assert "||" not in (c["name"] or "") + (c["phone"] or "")
    assert linked / entries > 0.95    # 현재 약 98%. 크게 떨어지면 파서가 깨진 것
