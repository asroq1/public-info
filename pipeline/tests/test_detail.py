import pytest

from app.detail import build_detail, clean_lines, law_names, normalize_apply_url


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("https://www.hometax.go.kr", "https://www.hometax.go.kr"),
        ("http://www.globalmarifin.com", "http://www.globalmarifin.com"),
        ("www.minwon.go.kr", "https://www.minwon.go.kr"),
        ("frc.sbiz.or.kr", "https://frc.sbiz.or.kr"),
        ("  www.smes.go.kr/sanhakin  ", "https://www.smes.go.kr/sanhakin"),
    ],
)
def test_apply_url_is_normalized(raw, expected):
    assert normalize_apply_url(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        None, "", "   ", "없음", "해당없음", "javascript:alert(1)", "JAVASCRIPT:alert(1)",
        "data:text/html,<script>1</script>", "ftp://files.go.kr", "//evil.com",
        "https://user:pw@evil.com", "http://localhost", "https://a b.go.kr",
        'https://x.go.kr/"onmouseover="x', "https://" + "a" * 400 + ".kr", "문의 바람 02-123-4567",
    ],
)
def test_unsafe_or_garbage_urls_are_rejected(raw):
    assert normalize_apply_url(raw) is None


def test_clean_lines_drops_placeholders_but_keeps_text():
    assert clean_lines("○ 신분증\r\n\r\n해당없음\n - \n○ 통장 사본") == ["신분증", "통장 사본"]
    assert clean_lines("- 주민등록등본 (3개월 이내)\nㆍ가족관계증명서") == ["주민등록등본 (3개월 이내)", "가족관계증명서"]
    assert clean_lines("○ ") == []
    assert clean_lines("없음") == []
    assert clean_lines(None) == []


def test_law_names_dedupes_articles():
    raw = "조세특례제한법(제100조의10, 제0항)||조세특례제한법(제100조의11, 제0항)||소득세법(제1조)"
    assert law_names(raw, 8) == ["조세특례제한법", "소득세법"]
    assert law_names("A법(제1조)||B법(제2조)||C법(제3조)", 2) == ["A법", "B법"]
    assert law_names("없음", 8) == []


def test_build_detail_omits_empty_fields():
    row = {
        "구비서류": "○ 신분증", "공무원확인구비서류": "해당없음", "본인확인필요구비서류": "없음",
        "온라인신청사이트URL": "www.minwon.go.kr", "법령": "민법(제1조)", "자치법규": "",
    }
    assert build_detail(row) == {"docs": ["신분증"], "apply_url": "https://www.minwon.go.kr", "laws": ["민법"]}
    assert build_detail(None) == {}
    assert build_detail({}) == {}
