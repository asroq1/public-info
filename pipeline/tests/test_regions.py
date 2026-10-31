import pytest

from app.regions import RegionResolver


def svc(org, kind):
    return {"소관기관명": org, "소관기관유형": kind}


SERVICES = [
    svc("서울특별시", "광역시도"), svc("부산광역시", "광역시도"), svc("경기도", "광역시도"),
    svc("세종특별자치시", "광역시도"), svc("전남광주통합특별시", "광역시도"),
    svc("서울특별시 중구", "시군구"), svc("서울특별시 강서구", "시군구"), svc("서울특별시 강남구", "시군구"),
    svc("부산광역시 중구", "시군구"), svc("부산광역시 강서구", "시군구"), svc("부산광역시 서구", "시군구"),
    svc("경기도 수원시", "시군구"), svc("경기도 동해시", "시군구"),
    svc("전남광주통합특별시 광산구", "시군구"), svc("전남광주통합특별시 목포시", "시군구"),
]
R = RegionResolver(SERVICES)


@pytest.mark.parametrize(
    "org,kind,expected",
    [
        ("서울특별시", "광역시도", ("서울특별시", None)),
        ("서울특별시 강남구", "시군구", ("서울특별시", "강남구")),
        ("부산광역시 중구", "시군구", ("부산광역시", "중구")),          # 같은 이름이 여러 시도에 있어도 쌍으로 구분
        ("전남광주통합특별시 광산구", "시군구", ("전남광주통합특별시", "광산구")),
        ("서울특별시교육청", "교육청", ("서울특별시", None)),
        ("전남광주통합특별시교육청", "교육청", ("전남광주통합특별시", None)),
        ("보건복지부", "중앙행정기관", (None, None)),
        ("국민연금공단", "공공기관", (None, None)),
        ("세종특별자치시", "광역시도", ("세종특별자치시", None)),
    ],
)
def test_core_types(org, kind, expected):
    assert R.resolve(org, kind) == expected


def test_unknown_sido_like_name_is_not_trusted():
    assert R.resolve("없는특별시", "광역시도") == (None, None)
    assert R.resolve("없는특별시교육청", "교육청") == (None, None)
    assert R.resolve("엉뚱한 기관", "시군구") == (None, None)


def test_public_enterprises_with_unique_district_name():
    assert R.resolve("목포시시설관리공단", "지방공기업") == ("전남광주통합특별시", "목포시")
    assert R.resolve("재단법인광산구미래교육재단", "지방출자_출연기관") == ("전남광주통합특별시", "광산구")


def test_ambiguous_district_name_gives_no_region():
    assert R.resolve("중구시설관리공단", "지방공기업") == (None, None)          # 서울·부산 둘 다 중구
    assert R.resolve("강서구도시관리공단", "지방공기업") == (None, None)


def test_longest_name_wins_so_gangseo_is_not_read_as_seo():
    # '강서구' 안에 '서구' 가 들어 있어도 '서구' 로 읽히면 안 된다
    assert R.resolve("강서구도시관리공단", "지방공기업") != ("부산광역시", "서구")


def test_sido_in_name_resolves_even_with_ambiguous_district():
    assert R.resolve("서울특별시 중구시설관리공단", "지방공기업") == ("서울특별시", "중구")
    assert R.resolve("부산광역시시설공단", "지방공기업") == ("부산광역시", None)


def test_non_matching_name_has_no_region():
    assert R.resolve("한국무슨재단", "지방출자_출연기관") == (None, None)
    assert R.resolve(None, None) == (None, None)


def test_region_list_includes_sido_without_districts():
    names = {r["name"]: r["districts"] for r in R.region_list()}
    assert names["세종특별자치시"] == []
    assert names["서울특별시"] == ["강남구", "강서구", "중구"]
    assert names["전남광주통합특별시"] == ["광산구", "목포시"]


def test_abbreviated_names_resolve_only_when_they_start_the_name():
    assert R.resolve("전남신용보증재단", "지방출자_출연기관") == ("전남광주통합특별시", None)
    assert R.resolve("(재)서울문화재단", "지방출자_출연기관") == ("서울특별시", None)
    assert R.resolve("재단법인수원문화재단", "지방출자_출연기관") == ("경기도", "수원시")
    assert R.resolve("수원도시공사", "지방공기업") == ("경기도", "수원시")
    # 이름 중간에 우연히 들어 있는 글자는 인정하지 않는다
    assert R.resolve("국립수원대재단", "지방출자_출연기관") == (None, None)
    assert R.resolve("한국서울증권원", "지방출자_출연기관") == (None, None)


def test_sido_abbreviations_for_chungcheong_and_gyeongsang():
    r = RegionResolver(SERVICES + [svc("충청북도", "광역시도"), svc("경상남도", "광역시도")])
    assert r.resolve("충북문화재단", "지방출자_출연기관") == ("충청북도", None)
    assert r.resolve("경남신용보증재단", "지방출자_출연기관") == ("경상남도", None)
    assert r.resolve("충남문화재단", "지방출자_출연기관") == (None, None)  # 충청남도가 데이터에 없으면 쓰지 않는다


def test_ambiguous_abbreviation_is_not_guessed():
    # '광주' 는 전남·광주 약칭일 수도, 경기도 광주시의 줄임말일 수도 있다
    r = RegionResolver(SERVICES + [svc("경기도 광주시", "시군구")])
    assert r.resolve("광주문화재단", "지방출자_출연기관") == (None, None)
    assert r.resolve("경기광주시설관리공단", "지방공기업") == ("경기도", "광주시")  # 시·도 이름이 들어 있어 확실한 경우는 그대로
