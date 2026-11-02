// 정책 페이지의 이 기기 안 기능: 서류 체크리스트, 관심 지원 저장, 마감일 달력(.ics) 내려받기.
// 모두 브라우저(localStorage)에만 저장하고 서버로 보내지 않는다.
// 스크립트가 꺼져 있어도 페이지는 그대로 읽히고, 이 스크립트가 켜질 때만 버튼과 진행 표시가 나타난다.
(function () {
  var DOCS_KEY = "benefit-docs-v1";
  var DOCS_MAX = 300; // 오래된 정책부터 지워 저장 공간을 제한한다
  var SAVED_KEY = "benefit-saved-v1"; // web/src/saved.js 와 같은 키·같은 규칙
  var SAVED_MAX = 500;

  function readJson(key) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v && typeof v === "object" ? v : {};
    } catch (e) {
      return {};
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* 저장소를 못 쓰는 환경에서는 이번 방문에서만 동작한다 */ }
  }

  // 서류 문구가 바뀌어도 다른 서류의 체크가 따라오지 않도록, 순번이 아니라 문구로 키를 만든다.
  function hashText(text) {
    var h = 5381;
    for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // 같은 문구가 두 번 나오면 뒤에 순번을 붙여 구분한다.
  function docKeys(texts) {
    var seen = {};
    return texts.map(function (t) {
      var h = hashText(t.trim());
      seen[h] = (seen[h] || 0) + 1;
      return seen[h] > 1 ? h + "." + seen[h] : h;
    });
  }

  function progressText(done, total) {
    if (total === 0) return "";
    return done === total ? "서류를 모두 준비했어요" : "서류 " + total + "개 중 " + done + "개 준비됨";
  }

  function copyText(title, url, texts) {
    var lines = [title, ""];
    texts.forEach(function (t) { lines.push("- " + t.trim()); });
    if (url) lines.push("", url);
    return lines.join("\n");
  }

  function saveDocs(policy, keys) {
    var all = readJson(DOCS_KEY);
    delete all[policy]; // 다시 넣어서 가장 최근 것으로 만든다
    if (keys.length) all[policy] = keys;
    var ids = Object.keys(all);
    while (ids.length > DOCS_MAX) delete all[ids.shift()];
    writeJson(DOCS_KEY, all);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy") ? resolve() : reject(new Error("copy")); } catch (e) { reject(e); } finally { document.body.removeChild(ta); }
    });
  }

  // ---- 관심 지원 저장 ----
  function readSaved() {
    try {
      var v = JSON.parse(localStorage.getItem(SAVED_KEY));
      return Array.isArray(v) ? v.filter(function (x) { return typeof x === "string"; }).slice(0, SAVED_MAX) : [];
    } catch (e) {
      return [];
    }
  }

  function toggleId(ids, id) {
    if (ids.indexOf(id) !== -1) return ids.filter(function (x) { return x !== id; });
    return [id].concat(ids).slice(0, SAVED_MAX);
  }

  function initSave(btn) {
    var id = btn.getAttribute("data-id");
    if (!id) return;
    var label = btn.querySelector("span");
    function paint() {
      var on = readSaved().indexOf(id) !== -1;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (label) label.textContent = on ? "저장됨" : "저장";
    }
    btn.hidden = false;
    paint();
    btn.addEventListener("click", function () {
      writeJson(SAVED_KEY, toggleId(readSaved(), id));
      paint();
    });
    window.addEventListener("storage", function (e) { if (e.key === SAVED_KEY) paint(); }); // 다른 탭에서 바꿔도 맞춘다
  }

  // ---- 마감일 달력(.ics, RFC 5545) ----
  function icsEscape(text) {
    return String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }

  function utf8Length(ch) {
    var c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }

  // 한 줄은 75바이트를 넘지 않게 접는다(이어지는 줄은 공백으로 시작). 한글이 중간에 잘리지 않게 글자 단위로 센다.
  function foldLine(line) {
    var out = [], cur = "", bytes = 0, ch;
    for (var i = 0; i < line.length; i += ch.length) {
      ch = String.fromCodePoint(line.codePointAt(i));
      var n = utf8Length(ch), limit = out.length ? 74 : 75;
      if (bytes + n > limit) { out.push(cur); cur = ""; bytes = 0; }
      cur += ch;
      bytes += n;
    }
    out.push(cur);
    return out.join("\r\n ");
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function nextDay(ymd) {
    var d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + 1));
    return "" + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
  }

  function stamp(now) {
    return "" + now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + "T" +
      pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + "Z";
  }

  // 신청 마감일을 하루짜리 일정으로, 사흘 전에 알림이 가게 만든다. end 는 'YYYYMMDD'.
  function buildIcs(o) {
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//public-info//benefit-finder//KO", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      "UID:" + o.id + "-" + o.end + "@benefit-finder",
      "DTSTAMP:" + stamp(o.now || new Date()),
      "DTSTART;VALUE=DATE:" + o.end,
      "DTEND;VALUE=DATE:" + nextDay(o.end),
      "SUMMARY:" + icsEscape("신청 마감: " + o.name),
      "DESCRIPTION:" + icsEscape("신청 마감일이에요. 공식 페이지에서 신청 가능 여부와 일정을 다시 확인하세요." + (o.url ? "\n" + o.url : "")),
    ];
    if (o.url) lines.push("URL:" + o.url);
    lines.push("BEGIN:VALARM", "TRIGGER:-P3D", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape("신청 마감 3일 전"), "END:VALARM", "END:VEVENT", "END:VCALENDAR");
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }

  function initIcs(btn) {
    var end = btn.getAttribute("data-end");
    if (!/^\d{8}$/.test(end || "")) return;
    btn.hidden = false;
    btn.addEventListener("click", function () {
      var ics = buildIcs({ id: btn.getAttribute("data-id"), name: btn.getAttribute("data-name") || "", end: end, url: location.href.split("#")[0] });
      var url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
      var a = document.createElement("a");
      a.href = url;
      a.download = "deadline-" + btn.getAttribute("data-id") + ".ics";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  }

  function initChecklist(box) {
    var policy = box.getAttribute("data-policy");
    var boxes = Array.prototype.slice.call(box.querySelectorAll(".check-list input[type=checkbox]"));
    if (!policy || !boxes.length) return;
    var texts = boxes.map(function (b) { return b.parentNode.textContent; });
    var keys = docKeys(texts);
    var saved = readJson(DOCS_KEY)[policy] || [];
    var progress = box.querySelector("[data-progress]");

    function refresh() {
      var done = boxes.filter(function (b) { return b.checked; }).length;
      if (progress) {
        progress.hidden = false;
        progress.textContent = progressText(done, boxes.length);
        progress.classList.toggle("done", done === boxes.length);
      }
      return done;
    }

    boxes.forEach(function (b, i) {
      b.checked = saved.indexOf(keys[i]) !== -1;
      b.addEventListener("change", function () {
        refresh();
        saveDocs(policy, keys.filter(function (_, j) { return boxes[j].checked; }));
      });
    });
    refresh();

    var copy = box.querySelector("[data-copy-docs]");
    if (copy) {
      copy.hidden = false;
      copy.addEventListener("click", function () {
        var label = copy.textContent;
        copyToClipboard(copyText(box.getAttribute("data-title") || "", location.href.split("#")[0], texts)).then(
          function () { copy.textContent = "복사했어요"; },
          function () { copy.textContent = "복사하지 못했어요"; }
        ).then(function () {
          setTimeout(function () { copy.textContent = label; }, 2000);
        });
      });
    }
  }

  if (typeof document !== "undefined") {
    var init = function () {
      Array.prototype.forEach.call(document.querySelectorAll("[data-checklist]"), initChecklist);
      Array.prototype.forEach.call(document.querySelectorAll("[data-save]"), initSave);
      Array.prototype.forEach.call(document.querySelectorAll("[data-ics]"), initIcs);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  // 단위 테스트용(브라우저에서는 쓰이지 않는다)
  if (typeof module === "object" && module.exports) {
    module.exports = {
      hashText: hashText, docKeys: docKeys, progressText: progressText, copyText: copyText,
      toggleId: toggleId, buildIcs: buildIcs, foldLine: foldLine, icsEscape: icsEscape, nextDay: nextDay,
    };
  }
})();
