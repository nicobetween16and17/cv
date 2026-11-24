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

  /* Parcours : carrousel circulaire.
     `pos` est la position (en nombre de cartes) qui glisse en douceur vers `target`.
     Pour chaque carte, d = distance circulaire au centre : elle pilote le décalage,
     la taille, le flou et la transparence, donc tout évolue pendant la transition. */
  document.querySelectorAll("[data-carousel]").forEach(function (root) {
    var track = root.querySelector(".c-track");
    var slides = Array.prototype.slice.call(root.querySelectorAll(".c-slide"));
    var dots = Array.prototype.slice.call(root.querySelectorAll(".c-dot"));
    var prev = root.querySelector("[data-prev]"), next = root.querySelector("[data-next]");
    var count = root.querySelector("[data-count]");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    var n = slides.length;
    if (!track || !n) return;

    var GAP = 0.92, MAX_BLUR = 6, MIN_SCALE = 0.82, SMOOTH = 9;
    var pos = 0, target = 0, raf = 0, last = 0, active = -1, drag = null, lastWheel = 0;
    function mod(a, m) { return ((a % m) + m) % m; }

    root.classList.add("is-live");

    /* Hauteur commune : la plus grande carte */
    function measure() {
      track.style.removeProperty("--c-h"); track.style.removeProperty("--c-stage");
      var h = 0;
      slides.forEach(function (s) { h = Math.max(h, s.offsetHeight); });
      track.style.setProperty("--c-h", h + "px");
      track.style.setProperty("--c-stage", (h + 24) + "px");
    }

    function render() {
      var stageW = track.clientWidth;
      var w = slides[0].offsetWidth, step = w * GAP;
      slides.forEach(function (s, i) {
        var d = i - pos;
        d -= n * Math.round(d / n);                 /* distance circulaire, entre -n/2 et n/2 */
        var a = Math.abs(d), k = Math.min(a, 1.5);
        if (a > 2.2) { s.style.visibility = "hidden"; return; }
        s.style.visibility = "visible";
        var x = (stageW - w) / 2 + d * step;
        var scale = 1 - (1 - MIN_SCALE) * (k / 1.5);
        var blur = k * MAX_BLUR;
        s.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0) scale(" + scale.toFixed(4) + ")";
        s.style.filter = blur > 0.2 ? "blur(" + blur.toFixed(2) + "px)" : "none";
        s.style.opacity = Math.max(0, 1 - a * 0.45).toFixed(3);
        s.style.zIndex = String(100 - Math.round(a * 10));
      });
      var cur = mod(Math.round(pos), n);
      if (cur !== active) {
        active = cur;
        slides.forEach(function (s, i) {
          s.classList.toggle("on", i === cur);
          if (i === cur) s.removeAttribute("aria-hidden"); else s.setAttribute("aria-hidden", "true");
        });
        dots.forEach(function (d, i) { if (i === cur) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current"); });
        if (count) count.textContent = (cur + 1) + " / " + n;
      }
    }

    function tick(t) {
      var dt = Math.min((t - last) / 1000, 0.05); last = t;
      var dragging = drag && drag.engaged;
      if (!dragging) {
        if (target !== Math.round(target)) target = Math.round(target);   /* on se pose toujours sur une carte */
        if (reduce.matches) pos = target;
        else pos += (target - pos) * (1 - Math.exp(-dt * SMOOTH));
        if (Math.abs(target - pos) < 0.0008) pos = target;
      }
      render();
      raf = (dragging || pos !== target) ? requestAnimationFrame(tick) : 0;
    }
    function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }

    function go(delta) { target = Math.round(target) + delta; kick(); }
    function goTo(i) {
      var d = i - mod(Math.round(target), n);
      d -= n * Math.round(d / n);
      target = Math.round(target) + d; kick();
    }

    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });
    dots.forEach(function (d) { d.addEventListener("click", function () { goTo(Number(d.dataset.go)); }); });
    track.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Home") { e.preventDefault(); goTo(0); }
      else if (e.key === "End") { e.preventDefault(); goTo(n - 1); }
    });
    /* Clic sur une carte voisine : elle passe au centre */
    slides.forEach(function (s, i) {
      s.addEventListener("click", function () { if (!justDragged && !(drag && drag.engaged) && !s.classList.contains("on")) goTo(i); });
    });
    /* Défilement horizontal au trackpad */
    track.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 18) return;
      e.preventDefault();
      var now = Date.now();
      if (now - lastWheel < 420) return;
      lastWheel = now; go(e.deltaX > 0 ? 1 : -1);
    }, { passive: false });

    /* Glisser (souris, doigt, stylet). Les fins de geste sont écoutées sur la fenêtre :
       relâcher hors du carrousel, perdre la capture ou changer d'onglet ne bloque rien. */
    function endDrag() {
      if (!drag) return;
      var d = drag; drag = null; track.classList.remove("drag");
      if (d.engaged) {
        var proj = pos + Math.max(-4, Math.min(4, d.v)) * 0.18;
        target = Math.round(proj);
        justDragged = true; setTimeout(function () { justDragged = false; }, 0);
      } else {
        target = Math.round(target);
      }
      kick();
    }
    var justDragged = false;
    track.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      endDrag();
      drag = { id: e.pointerId, x: e.clientX, pos0: pos, engaged: false, lx: e.clientX, lt: performance.now(), v: 0 };
    });
    window.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (e.pointerType === "mouse" && e.buttons === 0) { endDrag(); return; }   /* bouton relâché ailleurs */
      var dx = e.clientX - drag.x;
      if (!drag.engaged) {
        if (Math.abs(dx) < 6) return;
        drag.engaged = true; track.classList.add("drag");
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
      }
      var step = slides[0].offsetWidth * GAP, now = performance.now();
      var dt = Math.max(now - drag.lt, 1) / 1000;
      drag.v = 0.8 * drag.v + 0.2 * (-(e.clientX - drag.lx) / step / dt);
      drag.lx = e.clientX; drag.lt = now;
      pos = drag.pos0 - dx / step; target = pos;
      kick();
    });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("blur", endDrag);
    track.addEventListener("lostpointercapture", endDrag);
    document.addEventListener("visibilitychange", function () { if (document.hidden) endDrag(); });

    window.addEventListener("resize", function () { measure(); render(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); render(); });
    window.addEventListener("load", function () { measure(); render(); });
    measure(); render();
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
