import html as htmllib
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


def test_meta_description_fits_naver_limit():
    long_summary = "가" * 300
    s = {**SERVICE, "서비스목적요약": long_summary, "conditions": {}}
    html = bp.render_policy(s, [], {"생활안정": "/f/1"}, "2026-10-29")
    desc = re.search(r'<meta name="description" content="([^"]*)"', html).group(1)
    assert len(htmllib.unescape(desc)) <= 80  # 브라우저가 읽는 글자 수 기준


def test_field_art_per_field_and_fallback():
    assert bp.field_art("주거·자립")["hue"] != bp.field_art("보건·의료")["hue"]
    assert bp.field_art("없는 분야") == bp.field_art("기타")
    assert bp.field_art(None) == bp.field_art("기타")


def test_policy_page_has_field_banner():
    s = {**SERVICE, "conditions": {}}
    html = bp.render_policy(s, [], {"생활안정": "/f/1"}, "2026-10-29")
    assert 'class="banner"' in html and f'--h: {bp.field_art("생활안정")["hue"]}' in html


def test_every_real_field_has_icon():
    import json as _json
    full = _json.loads(bp.FULL_PATH.read_text(encoding="utf-8")) if bp.FULL_PATH.exists() else []
    fields = {s.get("서비스분야") for s in full if s.get("서비스분야")}
    missing = [f for f in fields if f not in bp.FIELD_ICONS]
    assert not missing, f"아이콘이 없는 분야: {missing}"


def _page(detail, **kw):
    s = {**SERVICE, "conditions": {}, "detail": detail}
    return bp.render_policy(s, [], {"생활안정": "/f/1"}, "2026-10-29")


def test_apply_button_and_documents_render():
    html = _page({"apply_url": "https://apply.go.kr/x", "docs": ["신분증", "통장 사본"], "laws": ["민법"]})
    assert 'href="https://apply.go.kr/x"' in html and "온라인으로 신청하기" in html
    assert 'href="https://example.gov/x?a=1&amp;b=2"' in html  # 공식 상세 페이지 링크도 유지
    assert "<h2>필요한 서류</h2>" in html and "통장 사본" in html
    assert "<h2>근거 법령</h2>" in html and "<li>민법</li>" in html


def test_without_detail_falls_back_to_official_page_button():
    html = _page({})
    assert "공식 페이지에서 신청·확인하기" in html
    assert "온라인으로 신청하기" not in html and "필요한 서류" not in html and "근거 법령" not in html


def test_detail_text_is_escaped():
    html = _page({"docs": ["<img src=x onerror=alert(1)>"], "laws": ["<script>x</script>법"]})
    assert "<img src=x" not in html and "<script>x</script>" not in html


def test_share_image_tags_use_absolute_url_and_field_image(monkeypatch):
    s = {**SERVICE, "conditions": {}}
    monkeypatch.setattr(bp, "SITE_URL", "https://site.kr")
    html = bp.render_policy(s, [], {"생활안정": "/f/1"}, "2026-10-29")
    slug = bp.field_art("생활안정")["slug"]
    assert f'property="og:image" content="https://site.kr/og/{slug}.png"' in html
    assert 'name="twitter:card" content="summary_large_image"' in html
    assert 'property="og:image:width" content="1200"' in html
    monkeypatch.setattr(bp, "SITE_URL", "")
    assert "og:image" not in bp.render_policy(s, [], {"생활안정": "/f/1"}, "2026-10-29")  # 절대 주소를 만들 수 없으면 생략


def test_every_field_has_a_share_image_file():
    og_dir = bp.ROOT.parent / "web" / "public" / "og"
    assert (og_dir / "default.png").exists()
    slugs = [a["slug"] for a in bp.FIELD_ICONS.values()]
    assert len(slugs) == len(set(slugs)), "slug 중복"
    missing = [s for s in slugs if not (og_dir / f"{s}.png").exists()]
    assert not missing, f"공유 이미지가 없는 분야: {missing} (scripts/make_og.py 를 실행하세요)"
