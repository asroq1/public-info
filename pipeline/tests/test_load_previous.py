import json

import httpx
import pytest

import build_index as bi


class FakeResponse:
    def __init__(self, status=200, body="{}"):
        self.status_code = status
        self._body = body

    def json(self):
        return json.loads(self._body)


@pytest.fixture
def site(monkeypatch):
    monkeypatch.setattr(bi, "SITE_URL", "https://site.kr")
    calls = []

    def install(response=None, error=None):
        def fake_get(url, **kwargs):
            calls.append((url, kwargs))
            if error:
                raise error
            return response

        monkeypatch.setattr(bi.httpx, "get", fake_get)
        return calls

    return install


def test_sends_explicit_user_agent_so_cloudflare_does_not_block_it(site):
    calls = site(FakeResponse(200, '{"a": "x"}'))
    assert bi.load_previous("hashes.json", None) == {"a": "x"}
    url, kwargs = calls[0]
    assert url == "https://site.kr/data/hashes.json"
    ua = kwargs["headers"]["User-Agent"]
    assert ua == bi.USER_AGENT and "python" not in ua.lower()   # Python 기본 이름이 아니어야 한다
    assert kwargs["follow_redirects"] is True and kwargs["timeout"] == 30


def test_missing_file_means_first_run(site):
    site(FakeResponse(404))
    assert bi.load_previous("hashes.json", None) is None


def test_spa_html_fallback_means_missing_file(site):
    site(FakeResponse(200, "<!doctype html><html></html>"))
    assert bi.load_previous("hashes.json", None) is None


def test_blocked_or_broken_responses_stop_the_build_instead_of_resetting_history(site):
    site(FakeResponse(403))
    with pytest.raises(SystemExit):
        bi.load_previous("hashes.json", None)


def test_network_error_stops_the_build(site):
    site(error=httpx.ConnectError("boom"))
    with pytest.raises(SystemExit):
        bi.load_previous("hashes.json", None)


def test_without_site_url_reads_local_file(tmp_path, monkeypatch):
    monkeypatch.setattr(bi, "SITE_URL", "")
    f = tmp_path / "hashes.json"
    f.write_text('{"k": "v"}', encoding="utf-8")
    assert bi.load_previous("hashes.json", f) == {"k": "v"}
    assert bi.load_previous("hashes.json", tmp_path / "none.json") is None
