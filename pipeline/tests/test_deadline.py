import pytest

from app.deadline import parse_deadline


@pytest.mark.parametrize(
    "text,expected",
    [
        # 정확한 기간
        ("2026.07.09~2026.07.27", {"b": 20260709, "e": 20260727}),
        ("2024.02.01~2024.02.20", {"b": 20240201, "e": 20240220}),
        ("2026. 2. 1. ~ 2026. 11. 30.", {"b": 20260201, "e": 20261130}),
        ("2026.5.14.~2026.5.28.", {"b": 20260514, "e": 20260528}),
        ("2025-07-14 ~ 2025-08-01", {"b": 20250714, "e": 20250801}),
        # 끝 날짜가 연도를 생략한 경우
        ("2026.1.26. ~ 12.15.", {"b": 20260126, "e": 20261215}),
        ("2026.3.1~3.15", {"b": 20260301, "e": 20260315}),
        # 월만 있는 경우: 시작은 1일, 끝은 말일
        ("2026.1. ~ 3.", {"b": 20260101, "e": 20260331}),
        # 여러 차수: 가장 늦은 날짜가 종료일
        ("1차 2026.3.1~2026.3.15, 2차 2026.9.1~2026.9.15", {"b": 20260301, "e": 20260915}),
        # 날짜 하나 + 까지
        ("2026.10.31까지", {"e": 20261031}),
        ("2026. 10. 31. 마감", {"e": 20261031}),
    ],
)
def test_explicit_ranges(text, expected):
    assert parse_deadline(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "", None, "   ",
        "상시신청", "접수기관 별 상이", "별도의 신청절차가 없음", "신청불필요", "추후 공지", "별도 공고기한내",
        "매년 1월", "매년 1~2월", "연중", "매년 연초", "해당연도 1~2월(모집기간 별도)", "매년 상반기",
        "정기신청 : 5.1.~5.31.", "정기신청 : 2026.5.1.~2026.5.31.",   # 반복 표현이 있으면 날짜가 있어도 제외
        "2026.01.19~2026.12.18 (매월 신청)",
        "3.1~3.15",                      # 연도 없음: 매년 반복일 수 있음
        "2월 말 공고(내용 및 신청기간) 확인 후 방문 신청",
        "2026.10.31",                    # 날짜 하나뿐이고 까지/마감 표시 없음
        "보장기간 : 2025. 1. 1. ~ 2025. 12. 31. (12개월간)", "사업기간 2025.3.1~2025.12.31", "교육기간: 2026.3.2~2026.3.20",
        "2026.13.40~2026.14.50",         # 존재하지 않는 날짜
        "문의 02-2100-1234",             # 전화번호가 날짜로 읽히면 안 됨
        "2026.2.30~2026.3.15",
    ],
)
def test_ambiguous_or_recurring_returns_nothing(text):
    assert parse_deadline(text) == {}


def test_start_only_text_has_no_end():
    assert parse_deadline("2025-07-14 ~ 예산소진 시까지") == {"b": 20250714}
    assert parse_deadline("2026. 3. 3. ~ 자금 소진 시") == {"b": 20260303}
    assert parse_deadline("2026.3.3부터") == {"b": 20260303}


def test_kind_overrides():
    assert parse_deadline("2024.02.01~2024.02.20", "상시신청") == {}
    assert parse_deadline("2024.02.01~2024.02.20", "접수기관별상이") == {}
    assert parse_deadline("2024.02.01~2024.02.20", "기간설정") == {"b": 20240201, "e": 20240220}


def test_phone_number_after_dates_is_not_a_date():
    assert parse_deadline("2026.3.1~2026.3.15 문의 02-2100-1234") == {"b": 20260301, "e": 20260315}


from app.deadline import fmt, status


def test_status_states():
    today = 20261031
    assert status({"b": 20260401, "e": 20260417}, today) == {"state": "closed", "end": 20260417, "end_fmt": "2026.04.17"}
    assert status({"e": 20261031}, today)["state"] == "open" and status({"e": 20261031}, today)["dday"] == 0  # 종료일 당일은 아직 열려 있다
    assert status({"e": 20261103}, today)["dday"] == 3
    assert status({"e": 20261231}, today)["dday"] == 61
    assert status({"b": 20261201, "e": 20261215}, today)["state"] == "upcoming"
    assert status({"b": 20260301}, today) == {}                    # 시작만 알고 종료를 모르면 표시 안 함
    assert status({}, today) == {} and status(None, today) == {}
    assert fmt(20260417) == "2026.04.17"
