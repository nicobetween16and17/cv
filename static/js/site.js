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

  /* Parcours : carrousel avec flou et échelle liés à la distance au centre */
  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var track = root.querySelector(".c-track");
    var slides = Array.prototype.slice.call(root.querySelectorAll(".c-slide"));
    var dots = Array.prototype.slice.call(root.querySelectorAll(".c-dot"));
    var prev = root.querySelector("[data-prev]"), next = root.querySelector("[data-next]");
    var count = root.querySelector("[data-count]");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var active = 0, ticking = false, MAX_BLUR = 7;
    if (!track || !slides.length) return;

    function targetLeft(i) {
      var s = slides[i];
      return s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2;
    }
    function go(i) {
      i = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: targetLeft(i), behavior: reduce.matches ? "auto" : "smooth" });
    }
    function nearest() {
      var best = 0, bestD = Infinity, left = track.scrollLeft;
      slides.forEach(function (s, i) {
        var d = Math.abs(targetLeft(i) - left);
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }
    function update() {
      ticking = false;
      var left = track.scrollLeft;
      slides.forEach(function (s) {
        var w = s.offsetWidth + 16;
        var k = Math.min(Math.abs(s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2 - left) / w, 1.2);
        if (reduce.matches) { s.style.filter = ""; s.style.opacity = ""; s.style.transform = ""; return; }
        var blur = k * MAX_BLUR;
        s.style.filter = blur > 0.2 ? "blur(" + blur.toFixed(2) + "px)" : "none";
        s.style.opacity = (1 - k * 0.5).toFixed(3);
        s.style.transform = "scale(" + (1 - k * 0.05).toFixed(4) + ")";
      });
      var n = nearest();
      if (n !== active || !slides[n].classList.contains("on")) {
        active = n;
        slides.forEach(function (s, i) { s.classList.toggle("on", i === n); });
        dots.forEach(function (d, i) { if (i === n) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
        if (count) count.textContent = (n + 1) + " / " + slides.length;
        if (prev) prev.disabled = n === 0;
        if (next) next.disabled = n === slides.length - 1;
      }
    }
    function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

    track.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", function () { go(active); schedule(); });
    if (prev) prev.addEventListener("click", function () { go(active - 1); });
    if (next) next.addEventListener("click", function () { go(active + 1); });
    dots.forEach(function (d) { d.addEventListener("click", function () { go(Number(d.dataset.go)); }); });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(active + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(active - 1); }
      else if (e.key === "Home") { e.preventDefault(); go(0); }
      else if (e.key === "End") { e.preventDefault(); go(slides.length - 1); }
    });

    /* Glisser à la souris (le tactile défile déjà tout seul) */
    var drag = null;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, left: track.scrollLeft, moved: false };
    });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 4) { drag.moved = true; track.classList.add("drag"); }
      if (drag.moved) track.scrollLeft = drag.left - dx;
    });
    function release() {
      if (!drag) return;
      var moved = drag.moved; drag = null;
      if (moved) { track.classList.remove("drag"); go(nearest()); }
    }
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);

    update();
  });

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
