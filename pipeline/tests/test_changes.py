from app import changes as ch


def svc(i, **kw):
    return {"서비스ID": i, "서비스명": f"s{i}", "지원대상": "대상", **kw}


def test_hash_ignores_whitespace_but_not_content():
    a = svc("1", 지원내용="월  10만원\r\n지급")
    b = svc("1", 지원내용="월 10만원 지급")
    c = svc("1", 지원내용="월 20만원 지급")
    assert ch.content_hash(a) == ch.content_hash(b)
    assert ch.content_hash(a) != ch.content_hash(c)


def test_first_run_has_no_diff():
    r = ch.diff(None, {"1": "a"})
    assert r["first_run"] and r["new"] == [] and r["updated"] == []


def test_new_updated_removed():
    base = {str(i): "h" for i in range(10, 30)}
    r = ch.diff({"1": "a", "2": "b", "3": "c", **base}, {"1": "a", "2": "X", "4": "d", **base})
    assert r["new"] == ["4"]
    assert r["updated"] == ["2"]
    assert r["removed"] == ["3"]
    assert not r["bulk"]


def test_bulk_change_is_not_reported_as_updates():
    prev = {str(i): "a" for i in range(10)}
    cur = {str(i): "b" for i in range(10)}
    r = ch.diff(prev, cur)
    assert r["bulk"] and r["updated"] == []


def test_same_day_rerun_keeps_earlier_results():
    first = ch.merge_history([], "2026-10-30", {"new": ["1"], "updated": [], "removed": []})
    # 재실행하면 이미 반영된 항목은 신규가 아니므로 비어 있는 결과가 들어온다
    second = ch.merge_history(first, "2026-10-30", {"new": [], "updated": ["2"], "removed": []})
    assert second == [{"date": "2026-10-30", "new": ["1"], "updated": ["2"], "removed": []}]


def test_history_is_trimmed_and_sorted():
    hist = [{"date": "2026-08-01", "new": [], "updated": [], "removed": []},
            {"date": "2026-10-29", "new": ["1"], "updated": [], "removed": []}]
    out = ch.merge_history(hist, "2026-10-30", {"new": ["2"], "updated": [], "removed": []})
    assert [h["date"] for h in out] == ["2026-10-30", "2026-10-29"]


def test_recent_registered_window():
    rows = ch.recent_registered(
        [svc("old", 등록일시="20200101000000"), svc("a", 등록일시="20261026101010"),
         svc("b", 등록일시="20261012000000")],
        "2026-10-30",
    )
    assert [r["id"] for r in rows] == ["a", "b"]
