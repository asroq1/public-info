// 화면 모드(라이트/다크) 전환. 기본은 항상 라이트이고, 선택은 이 기기의 브라우저에만 저장된다.
// <head> 에서 동기 로드되어 첫 화면이 그려지기 전에 저장된 모드를 적용한다(깜빡임 방지).
(function () {
  var KEY = "theme";
  var root = document.documentElement;
  try {
    if (localStorage.getItem(KEY) === "dark") root.setAttribute("data-theme", "dark");
  } catch (e) { /* 저장소를 못 쓰는 환경에서는 기본(라이트) 유지 */ }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    var dark = root.getAttribute("data-theme") === "dark";
    if (dark) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", "dark");
    try { localStorage.setItem(KEY, dark ? "light" : "dark"); } catch (err) { /* 무시 */ }
  });
})();
