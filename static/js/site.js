/* Comportements du site : thème, filtres, volets, copie de l'adresse e-mail. */
(function () {
  "use strict";
  var root = document.documentElement;

  /* Thème clair ou sombre */
  var btn = document.getElementById("themeBtn");
  var sysDark = window.matchMedia("(prefers-color-scheme: dark)");
  function current() { return root.dataset.theme || (sysDark.matches ? "dark" : "light"); }
  function label() { if (btn) btn.textContent = current() === "dark" ? "☾ sombre" : "☀ clair"; }
  if (btn) {
    btn.addEventListener("click", function () {
      var next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      label();
      document.dispatchEvent(new CustomEvent("themechange"));
    });
    sysDark.addEventListener("change", function () { label(); document.dispatchEvent(new CustomEvent("themechange")); });
    label();
  }

  /* Filtres : <div data-filter-for="x"> pilote <div data-filter-items="x"> */
  document.querySelectorAll("[data-filter-for]").forEach(function (group) {
    var items = document.querySelector('[data-filter-items="' + group.dataset.filterFor + '"]');
    if (!items) return;
    group.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      group.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      var value = chip.dataset.value;
      items.querySelectorAll("[data-tags]").forEach(function (item) {
        item.hidden = !(value === "Tout" || item.dataset.tags.split("|").indexOf(value) !== -1);
      });
    });
  });

  /* Tout déplier ou replier */
  var toggle = document.getElementById("toggleAll");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var all = Array.prototype.slice.call(document.querySelectorAll("details.job"));
      var open = all.some(function (d) { return !d.open; });
      all.forEach(function (d) { d.open = open; });
      toggle.textContent = open ? "Tout replier" : "Tout déplier";
    });
  }

  /* Copie de l'adresse e-mail */
  var copy = document.getElementById("copyMail");
  if (copy) {
    copy.addEventListener("click", function () {
      var mail = document.getElementById("mail");
      var toast = document.getElementById("toast");
      function done(msg) { toast.textContent = msg; setTimeout(function () { toast.textContent = ""; }, 2200); }
      function select() {
        var r = document.createRange(); r.selectNodeContents(mail);
        var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        done("Adresse sélectionnée, copiez-la");
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(mail.textContent.trim()).then(function () { done("Adresse copiée"); }, select);
      } else { select(); }
    });
  }

  /* Note d'exemple */
  var note = document.getElementById("note"), close = document.getElementById("noteClose");
  if (note && close) close.addEventListener("click", function () { note.hidden = true; });

  /* Section active dans le menu */
  var links = Array.prototype.slice.call(document.querySelectorAll(".bar nav a[data-s]"));
  var sections = document.querySelectorAll("main section[id]");
  if ("IntersectionObserver" in window && sections.length && links.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle("on", a.dataset.s === e.target.id); });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  }
})();
