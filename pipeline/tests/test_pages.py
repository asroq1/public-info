import json
import re

import build_pages as bp

SERVICE = {
    "서비스ID": "T1",
    "서비스명": "테스트 <b>지원</b>",
    "서비스분야": "생활안정",
    "소관기관명": "서울특별시",
    "지원유형": "현금",
    "서비스목적요약": "요약 </script><script>alert(1)</script>",
    "지원대상": "○ 만 19세 이상\r\n○ 무주택자",
    "신청기한": "상시",
    "상세조회URL": "https://example.gov/x?a=1&b=2",
}


def render(**kw):
    return bp.render_policy(SERVICE, kw.get("related", []), {"생활안정": "/f/1"}, "2026-10-29")


def test_text_is_escaped():
    html = render()
    assert "<b>지원</b>" not in html.split("<h1>")[1].split("</h1>")[0]
    assert "<script>alert(1)" not in html


def test_jsonld_is_valid_and_cannot_break_out():
    html = render()
    raw = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S).group(1)
    data = json.loads(raw)
    assert data["@type"] == "GovernmentService"
    assert "</script>" not in raw


def test_paragraphs_split_without_altering_text():
    assert bp.paragraphs("○ 만 19세 이상\r\n\r\n○ 무주택자") == ["○ 만 19세 이상", "○ 무주택자"]
    html = render()
    assert "○ 만 19세 이상" in html and "○ 무주택자" in html


def test_official_link_and_disclaimer_present():
    html = render()
    assert 'href="https://example.gov/x?a=1&amp;b=2"' in html
    assert "자격을 확정하지 않습니다" in html


def test_missing_sections_are_omitted():
    html = render()
    assert "<h2>선정기준</h2>" not in html
    assert "<h2>지원대상</h2>" in html


def test_canonical_only_with_site_url(monkeypatch):
    monkeypatch.setattr(bp, "SITE_URL", "https://site.kr")
    assert 'rel="canonical" href="https://site.kr/p/T1"' in render()
    monkeypatch.setattr(bp, "SITE_URL", "")
    assert "canonical" not in render()


def test_sitemap_format():
    xml = bp.sitemap([("https://s.kr/p/1", "2026-01-02"), ("https://s.kr/", None)])
    assert "<loc>https://s.kr/p/1</loc><lastmod>2026-01-02</lastmod>" in xml
    assert "<loc>https://s.kr/</loc></url>" in xml


def test_to_date():
    assert bp.to_date("20260430093900") == "2026-04-30"
    assert bp.to_date("") is None
    assert bp.to_date("garbage") is None


def test_who_section_lists_only_restrictive_conditions():
    from app.conditions import describe_conditions

    rows = dict(describe_conditions({
        "a": [18, 39], "g": ["M", "F"], "i": [1, 2],
        "p": ["0302", "0328"], "h": ["0403", "0410"],
    }))
    assert rows["나이"] == "만 18세 이상 39세 이하"
    assert "성별" not in rows            # 남녀 모두면 표기하지 않음
    assert rows["소득"] == "중위소득 50% 이하, 중위소득 51~75%"
    assert rows["해당 상황"] == "임산부, 장애인"
    assert "가구 상황" not in rows        # 해당사항없음 코드가 있으면 제한 없음


def test_who_section_rendering_and_empty_states():
    s = {**SERVICE, "conditions": {"a": [65, None], "g": ["F"]}}
    html = bp.render_policy(s, [], {"생활안정": "/f/1"}, "2026-10-29")
    assert "만 65세 이상" in html and "<dd>여성</dd>" in html
    s = {**SERVICE, "conditions": {"nc": 1}}
    assert "지원조건 코드가 없는 서비스" in bp.render_policy(s, [], {}, "2026-10-29")
    s = {**SERVICE, "conditions": {"g": ["M", "F"]}}
    assert "별도 제한 코드가 없습니다" in bp.render_policy(s, [], {}, "2026-10-29")
