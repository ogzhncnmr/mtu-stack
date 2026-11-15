/* Sayfa iskeleti: dil (TR/EN), tema, üst çubuk gölgesi, yıl.
   Dil ve tema seçimi localStorage'da tutulur ("lang", "theme"); oguzhancanmar.com ile aynı anahtarlar.
   - data-i18n="anahtar"       → içerik window.PAGE_EN[anahtar] ile değişir
   - data-i18n-aria / -title   → aria-label / title
   - window.L(tr, en)          → betiklerde dil seçimi
   - data-site                 → yalnızca oguzhancanmar.com içinde anlamlı bağlantılar; dışarıda gizlenir */
(function () {
  "use strict";
  var root = document.documentElement;
  var lang = localStorage.getItem("lang") === "en" ? "en" : "tr";
  var EN = window.PAGE_EN || {};
  window.LANG = lang;
  window.L = function (tr, en) { return lang === "en" && en != null ? en : tr; };
  root.lang = lang;

  if (lang === "en") {
    document.querySelectorAll("[data-i18n]").forEach(function (el) { var v = EN[el.getAttribute("data-i18n")]; if (v != null) el.innerHTML = v; });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { var v = EN[el.getAttribute("data-i18n-aria")]; if (v != null) el.setAttribute("aria-label", v); });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) { var v = EN[el.getAttribute("data-i18n-title")]; if (v != null) el.setAttribute("title", v); });
    if (EN.$title) document.title = EN.$title;
    var d = document.querySelector('meta[name="description"]');
    if (d && EN.$desc) d.setAttribute("content", EN.$desc);
  }

  var lb = document.getElementById("langToggle");
  if (lb) {
    var lab = lb.querySelector("[data-lang-label]");
    if (lab) lab.textContent = lang === "en" ? "TR" : "EN";
    lb.title = lang === "en" ? "Türkçe" : "English";
    lb.addEventListener("click", function () { localStorage.setItem("lang", lang === "en" ? "tr" : "en"); location.reload(); });
  }

  var tb = document.getElementById("themeToggle");
  if (tb) tb.addEventListener("click", function () {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("theme", root.dataset.theme);
  });

  var nav = document.getElementById("nav");
  var onScroll = function () { if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 20); };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Araç sitenin dışında (ör. GitHub Pages) açıldıysa siteye dönük bağlantıları gizle.
  if (location.pathname.indexOf("/araclar/mtu") < 0) {
    document.querySelectorAll("[data-site]").forEach(function (el) { el.hidden = true; });
    var logo = document.querySelector(".nav__logo");
    if (logo) logo.setAttribute("href", "./");
  }
})();
