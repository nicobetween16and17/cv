/* Labyrinthe 3D : moteur de raycasting (algorithme DDA), textures générées par code.
   Le serveur Flask fournit seulement le niveau (/api/wolf/level) ; tout le calcul se fait ici. */
(function () {
  "use strict";

  var canvas = document.getElementById("wolf");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;
  var frame = ctx.createImageData(W, H);
  var buf = new Uint32Array(frame.data.buffer);           /* un entier par pixel : 0xAABBGGRR */

  var mini = document.getElementById("mini");
  var mctx = mini.getContext("2d");
  var ui = {
    overlay: document.getElementById("wOverlay"), title: document.getElementById("wTitle"),
    msg: document.getElementById("wMsg"), start: document.getElementById("wStart"),
    restart: document.getElementById("wRestart"), mapBtn: document.getElementById("wMapBtn"),
    time: document.getElementById("wTime"), best: document.getElementById("wBest")
  };
  var coarse = window.matchMedia("(pointer: coarse)").matches;

  /* ------------------------------------------------------------------ */
  /* Textures 64 x 64 générées par code (aucune image externe)           */
  /* ------------------------------------------------------------------ */
  var TEX = 64;
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function px(r, g, b) { return (0xFF000000 | (clamp(b | 0, 0, 255) << 16) | (clamp(g | 0, 0, 255) << 8) | clamp(r | 0, 0, 255)) >>> 0; }
  function make(fn) {
    var t = new Uint32Array(TEX * TEX);
    for (var y = 0; y < TEX; y++) for (var x = 0; x < TEX; x++) t[y * TEX + x] = fn(x, y);
    return t;
  }

  function texStone() {                       /* briques grises décalées */
    var r = rng(11), tone = [];
    for (var i = 0; i < 8; i++) { tone[i] = []; for (var j = 0; j < 4; j++) tone[i][j] = (r() - 0.5) * 34; }
    return make(function (x, y) {
      var row = y >> 4, off = (row & 1) * 16, ox = (x + off) & 63, col = ox >> 5, ry = y & 15, rx = ox & 31;
      var n = (r() - 0.5) * 14;
      if (ry < 2 || rx < 2) return px(62 + n * 0.3, 62 + n * 0.3, 68 + n * 0.3);
      var base = 122 + tone[row][col] + n;
      if (ry === 2) base += 16; if (ry === 15) base -= 18; if (rx === 2) base += 10; if (rx === 31) base -= 12;
      return px(base, base, base + 4);
    });
  }
  function texBlue() {                        /* grands blocs bleus avec cadre en relief */
    var r = rng(23);
    return make(function (x, y) {
      var bx = x & 31, by = y & 31, n = (r() - 0.5) * 12;
      if (bx < 2 || by < 2) return px(20, 28, 60);
      var edge = Math.min(bx - 2, by - 2, 29 - bx, 29 - by);
      var b = 1;
      if (edge < 2) b = (bx < 16 && by < 16) || edge === 0 ? 1.28 : 0.74;
      if (edge >= 5 && edge <= 6) b *= 0.86;
      return px((46 + n) * b, (72 + n) * b, (150 + n) * b);
    });
  }
  function texWood() {                        /* planches verticales et traverses clouées */
    var r = rng(37), knots = [];
    for (var i = 0; i < 4; i++) knots[i] = { y: 8 + r() * 48, s: 2 + r() * 2 };
    return make(function (x, y) {
      var plank = x >> 4, px16 = x & 15;
      if (px16 === 0 || px16 === 15) return px(36, 22, 10);
      var k = knots[plank], dk = Math.hypot(px16 - 8, (y - k.y) * 0.6);
      var grain = Math.sin(y * 0.28 + plank * 2.3 + px16 * 0.5) * 9 + (r() - 0.5) * 10;
      var c = 128 + grain - (dk < k.s ? 28 : 0);
      var rail = (y >= 10 && y < 15) || (y >= 49 && y < 54);
      if (rail) {
        var nail = (px16 === 7 || px16 === 8) && (y === 12 || y === 51);
        return nail ? px(170, 170, 175) : px(c * 0.62, c * 0.42, c * 0.24);
      }
      return px(c, c * 0.66, c * 0.36);
    });
  }
  function texMetal() {                       /* panneaux rivetés avec fentes */
    var r = rng(51);
    return make(function (x, y) {
      var bx = x & 31, by = y & 31, n = (r() - 0.5) * 8;
      if (bx < 2 || by < 2) return px(34, 38, 44);
      var c = 98 + n;
      if (bx === 2 || by === 2) c += 26; if (bx === 31 || by === 31) c -= 22;
      var rivets = [[5, 5], [26, 5], [5, 26], [26, 26]];
      for (var i = 0; i < 4; i++) {
        var d = Math.hypot(bx - rivets[i][0], by - rivets[i][1]);
        if (d < 2.2) c = d < 1 ? 190 : 150; else if (d < 3.2) c -= 18;
      }
      if (by >= 13 && by <= 18 && bx > 8 && bx < 24 && (by & 1) === 1) c = 38;
      return px(c * 0.92, c, c * 1.08);
    });
  }
  function texExit() {                        /* panneau SORTIE, dessiné avec le canvas 2D */
    var c = document.createElement("canvas"); c.width = c.height = TEX;
    var g = c.getContext("2d");
    g.fillStyle = "#0f4a28"; g.fillRect(0, 0, TEX, TEX);
    g.fillStyle = "#17632f"; g.fillRect(0, 0, TEX, 3); g.fillRect(0, 0, 3, TEX);
    g.strokeStyle = "#46e47a"; g.lineWidth = 3; g.strokeRect(4, 4, TEX - 8, TEX - 8);
    g.fillStyle = "#d6ffe2"; g.font = "bold 13px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("SORTIE", 32, 24);
    g.beginPath(); g.moveTo(16, 42); g.lineTo(40, 42); g.lineTo(40, 36); g.lineTo(52, 46); g.lineTo(40, 56); g.lineTo(40, 50); g.lineTo(16, 50); g.closePath();
    g.fillStyle = "#46e47a"; g.fill();
    return new Uint32Array(g.getImageData(0, 0, TEX, TEX).data.buffer.slice(0));
  }

  var textures = { 1: texStone(), 2: texBlue(), 3: texWood(), 4: texMetal(), 5: texExit() };
  var wallColors = { 1: "#8a8a92", 2: "#3a5aa8", 3: "#9a6a38", 4: "#6c7886", 5: "#46e47a" };

  /* Textures personnalisées. Deux sources possibles, la plus précise l'emporte :
       1) une image par mur : static/img/walls/1.png à 5.png (remplace la texture générée) ;
       2) une planche : static/img/walls/sheet.png, dont les cases sont séparées par des lignes
          d'une couleur-clé (#008580 par défaut). La grille est détectée automatiquement. */
  var fixed = {};                                  /* ids déjà fournis par une image individuelle */

  function toTexture(img, sx, sy, sw, sh) {
    var c = document.createElement("canvas"); c.width = c.height = TEX;
    var g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = false; g.drawImage(img, sx, sy, sw, sh, 0, 0, TEX, TEX);
    return new Uint32Array(g.getImageData(0, 0, TEX, TEX).data.buffer.slice(0));
  }

  function loadCustom(map) {
    Object.keys(map || {}).forEach(function (id) {
      var im = new Image();
      im.onload = function () { textures[id] = toTexture(im, 0, 0, im.naturalWidth, im.naturalHeight); fixed[id] = true; needsDraw = true; };
      im.src = map[id];
    });
  }

  /* Détecte les cases : une colonne (ou une ligne) entièrement de la couleur-clé est un séparateur,
     chaque suite de colonnes (ou de lignes) non séparatrices est une case. */
  function runs(sep, n) {
    var out = [], start = -1;
    for (var i = 0; i <= n; i++) {
      var inside = i < n && !sep[i];
      if (inside && start < 0) start = i;
      if (!inside && start >= 0) { out.push({ start: start, len: i - start }); start = -1; }
    }
    return out;
  }
  function parseHex(h) { h = String(h || "#008580").replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

  function loadSheet(cfg) {
    if (!cfg || !cfg.url) return;
    var im = new Image();
    im.onload = function () {
      var w = im.naturalWidth, h = im.naturalHeight, c = document.createElement("canvas"); c.width = w; c.height = h;
      var g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0);
      var d = g.getImageData(0, 0, w, h).data, k = parseHex(cfg.key);
      function isKey(i) { return d[i] === k[0] && d[i + 1] === k[1] && d[i + 2] === k[2]; }
      var colSep = [], rowSep = [], x, y;
      for (x = 0; x < w; x++) { var sc = true; for (y = 0; y < h; y++) if (!isKey((y * w + x) * 4)) { sc = false; break; } colSep[x] = sc; }
      for (y = 0; y < h; y++) { var sr = true; for (x = 0; x < w; x++) if (!isKey((y * w + x) * 4)) { sr = false; break; } rowSep[y] = sr; }
      var xs = runs(colSep, w), ys = runs(rowSep, h);
      Object.keys(cfg.cells || {}).forEach(function (id) {
        var rc = cfg.cells[id], cx = xs[rc[0]], cy = ys[rc[1]];
        if (!cx || !cy || fixed[id]) return;
        textures[id] = toTexture(c, cx.start, cy.start, cx.len, cy.len);
      });
      sheetInfo = { cols: xs.length, rows: ys.length };
      needsDraw = true;
    };
    im.src = cfg.url;
  }
  var sheetInfo = null;

  /* ------------------------------------------------------------------ */
  /* Niveau                                                             */
  /* ------------------------------------------------------------------ */
  /* # B W M E : murs de base ; chiffres 6 à 9 : murs supplémentaires, textures prises dans la planche */
  var CODES = { "#": 1, "B": 2, "W": 3, "M": 4, "E": 5, "6": 6, "7": 7, "8": 8, "9": 9 };
  var cols = 0, rows = 0, grid = null, start = { x: 1.5, y: 1.5, angle: 0 };
  var CELL = 6;

  function parseLevel(level) {
    rows = level.rows.length; cols = level.rows[0].length;
    grid = new Uint8Array(cols * rows);
    level.rows.forEach(function (line, y) {
      for (var x = 0; x < cols; x++) {
        var ch = line.charAt(x);
        grid[y * cols + x] = CODES[ch] || 0;
        if (ch === "S") start = { x: x + 0.5, y: y + 0.5, angle: ((level.start_angle || 0) * Math.PI) / 180 };
      }
    });
    mini.width = cols * CELL; mini.height = rows * CELL;
  }
  function cell(x, y) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) return 1;
    return grid[y * cols + x];
  }

  /* ------------------------------------------------------------------ */
  /* État du joueur                                                     */
  /* ------------------------------------------------------------------ */
  var p = { x: 1.5, y: 1.5, dx: 1, dy: 0, plx: 0, ply: 0.66 };
  var FOV_PLANE = 0.66, RADIUS = 0.22, WALK = 3.0, RUN = 5.0, TURN_KEYS = 2.3, MOUSE_SENS = 0.0023;
  var state = "loading";                     /* loading | ready | playing | paused | won */
  var elapsed = 0, needsDraw = true, raf = 0, last = null, usedLock = false, showMini = true;
  var keys = {}, touch = { move: null, turn: null, mx: 0, my: 0 };

  function setAngle(a) {
    p.dx = Math.cos(a); p.dy = Math.sin(a);
    p.plx = -p.dy * FOV_PLANE; p.ply = p.dx * FOV_PLANE;
  }
  function rotate(a) {
    var c = Math.cos(a), s = Math.sin(a), ox = p.dx, oy = p.dy;
    p.dx = ox * c - oy * s; p.dy = ox * s + oy * c;
    var px0 = p.plx; p.plx = px0 * c - p.ply * s; p.ply = px0 * s + p.ply * c;
  }
  function reset() {
    p.x = start.x; p.y = start.y; setAngle(start.angle);
    elapsed = 0; keys = {}; needsDraw = true; updateTime();
  }
  function blocked(x, y) {
    return cell(Math.floor(x - RADIUS), Math.floor(y - RADIUS)) > 0 || cell(Math.floor(x + RADIUS), Math.floor(y - RADIUS)) > 0 ||
           cell(Math.floor(x - RADIUS), Math.floor(y + RADIUS)) > 0 || cell(Math.floor(x + RADIUS), Math.floor(y + RADIUS)) > 0;
  }
  function nearExit() {
    var cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
      if (cell(cx + i, cy + j) !== 5) continue;
      var nx = clamp(p.x, cx + i, cx + i + 1), ny = clamp(p.y, cy + j, cy + j + 1);
      if (Math.hypot(p.x - nx, p.y - ny) < 0.45) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ */
  /* Rendu : un rayon par colonne                                       */
  /* ------------------------------------------------------------------ */
  var CEIL = [34, 38, 56], FLOOR = [104, 90, 78];

  function drawBackground() {
    var half = H >> 1;
    for (var y = 0; y < H; y++) {
      var c, f;
      if (y < half) { f = 0.55 + 0.45 * (y / half); c = px(CEIL[0] * f, CEIL[1] * f, CEIL[2] * f); }
      else { f = 0.22 + 0.7 * ((y - half) / half); c = px(FLOOR[0] * f, FLOOR[1] * f, FLOOR[2] * f); }
      buf.fill(c, y * W, (y + 1) * W);
    }
  }

  function render() {
    drawBackground();
    for (var x = 0; x < W; x++) {
      var camX = 2 * x / W - 1;
      var rdx = p.dx + p.plx * camX, rdy = p.dy + p.ply * camX;
      var mx = Math.floor(p.x), my = Math.floor(p.y);
      var ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      var stepX, stepY, sdx, sdy, side = 0, type = 0;
      if (rdx < 0) { stepX = -1; sdx = (p.x - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - p.x) * ddx; }
      if (rdy < 0) { stepY = -1; sdy = (p.y - my) * ddy; } else { stepY = 1; sdy = (my + 1 - p.y) * ddy; }
      for (var guard = 0; guard < 64; guard++) {                   /* DDA : on saute de case en case */
        if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
        type = cell(mx, my);
        if (type > 0) break;
      }
      if (type === 0) continue;
      var dist = side === 0 ? sdx - ddx : sdy - ddy;               /* distance perpendiculaire : pas de fisheye */
      if (dist < 0.0001) dist = 0.0001;
      var lineH = (H / dist) | 0;
      var y0 = ((H - lineH) >> 1), y1 = y0 + lineH;
      var wallX = side === 0 ? p.y + dist * rdy : p.x + dist * rdx; wallX -= Math.floor(wallX);
      var tx = (wallX * TEX) | 0;
      if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) tx = TEX - 1 - tx;   /* repère y vers le bas : la texture doit se lire de gauche à droite */
      var tex = textures[type] || textures[1];
      var f = ((side === 1 ? 0.72 : 1) * clamp(1.08 - dist / 15, 0.16, 1) * 256) | 0;
      var step = TEX / lineH, tpos = (Math.max(y0, 0) - y0) * step;
      var ys = y0 < 0 ? 0 : y0, ye = y1 > H ? H : y1;
      for (var y = ys; y < ye; y++) {
        var c = tex[((tpos | 0) & 63) * TEX + tx]; tpos += step;
        buf[y * W + x] = (0xFF000000 | ((((c >> 16) & 255) * f >> 8) << 16) | ((((c >> 8) & 255) * f >> 8) << 8) | (((c & 255) * f) >> 8)) >>> 0;
      }
    }
    ctx.putImageData(frame, 0, 0);
  }

  function drawMini() {
    if (!showMini || !grid) return;
    mctx.clearRect(0, 0, mini.width, mini.height);
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var t = grid[y * cols + x];
      mctx.fillStyle = t ? wallColors[t] : "rgba(255,255,255,0.06)";
      mctx.fillRect(x * CELL, y * CELL, CELL - (t ? 0 : 1), CELL - (t ? 0 : 1));
    }
    var cx = p.x * CELL, cy = p.y * CELL;
    mctx.strokeStyle = "rgba(255,255,255,0.45)"; mctx.lineWidth = 1;
    mctx.beginPath(); mctx.moveTo(cx, cy); mctx.lineTo(cx + p.dx * CELL * 3, cy + p.dy * CELL * 3); mctx.stroke();
    mctx.fillStyle = "#ffd84a"; mctx.beginPath(); mctx.arc(cx, cy, 2.4, 0, Math.PI * 2); mctx.fill();
  }

  /* ------------------------------------------------------------------ */
  /* Boucle de jeu (le temps vient uniquement de requestAnimationFrame) */
  /* ------------------------------------------------------------------ */
  function fmt(s) { var m = Math.floor(s / 60); return m + ":" + (s - m * 60).toFixed(1).padStart(4, "0"); }
  function updateTime() { ui.time.textContent = fmt(elapsed); }

  function update(dt) {
    var fwd = 0, side = 0, turn = 0;
    if (keys.KeyW || keys.ArrowUp) fwd += 1;
    if (keys.KeyS || keys.ArrowDown) fwd -= 1;
    if (keys.KeyD) side += 1;
    if (keys.KeyA) side -= 1;
    if (keys.ArrowRight) turn += 1;
    if (keys.ArrowLeft) turn -= 1;
    if (touch.move !== null) { side += touch.mx; fwd += touch.my; }
    var speed = (keys.ShiftLeft || keys.ShiftRight ? RUN : WALK);
    var len = Math.hypot(fwd, side); if (len > 1) { fwd /= len; side /= len; }
    var mvx = (p.dx * fwd - p.dy * side) * speed * dt, mvy = (p.dy * fwd + p.dx * side) * speed * dt;
    if (!blocked(p.x + mvx, p.y)) p.x += mvx;
    if (!blocked(p.x, p.y + mvy)) p.y += mvy;
    if (turn) rotate(turn * TURN_KEYS * dt);
    if (nearExit()) win();
  }

  function tick(t) {
    var dt = last === null ? 1 / 60 : (t - last) / 1000;
    last = t;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;
    if (state === "playing") {
      /* Sous-étapes de 1/60 s au plus : même vitesse quelle que soit la fluidité de l'écran,
         et impossible de traverser un mur lors d'une image lente. */
      var n = Math.ceil(dt * 60), h = dt / n;
      for (var i = 0; i < n && state === "playing"; i++) { elapsed += h; update(h); }
      updateTime(); needsDraw = true;
    }
    if (needsDraw && grid) {
      var t0 = performance.now(); render(); drawMini(); needsDraw = false;
      stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;
    }
    raf = requestAnimationFrame(tick);
  }
  var stats = { ms: 0 };

  /* ------------------------------------------------------------------ */
  /* États et interface                                                 */
  /* ------------------------------------------------------------------ */
  function bestTime() { try { var v = parseFloat(localStorage.getItem("wolf-best")); return isFinite(v) ? v : null; } catch (e) { return null; } }
  function showBest() { var b = bestTime(); ui.best.textContent = b ? "Record " + fmt(b) : ""; }

  function overlay(title, msg, button) {
    ui.title.textContent = title; ui.msg.textContent = msg; ui.start.textContent = button;
    ui.overlay.hidden = false; ui.start.disabled = false;
  }
  var HELP = coarse ? "Glissez le doigt à gauche pour avancer, à droite pour tourner."
                    : "Cliquez pour capturer la souris. W A S D pour bouger, souris pour tourner, Échap pour la pause.";

  function ready() { state = "ready"; reset(); overlay("Prêt ?", HELP, "Jouer"); needsDraw = true; }
  function play() {
    if (state === "won") reset();
    state = "playing"; ui.overlay.hidden = true; last = null;
    if (!coarse && canvas.requestPointerLock) { try { var r = canvas.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } catch (e) {} }
    canvas.focus({ preventScroll: true });
  }
  function pause() {
    if (state !== "playing") return;
    state = "paused"; keys = {}; touch.move = touch.turn = null; touch.mx = touch.my = 0;
    overlay("Pause", "Le temps est arrêté.", "Reprendre");
  }
  function win() {
    state = "won"; keys = {}; needsDraw = true;
    if (document.exitPointerLock) document.exitPointerLock();
    var best = bestTime(), record = !best || elapsed < best;
    if (record) { try { localStorage.setItem("wolf-best", String(elapsed)); } catch (e) {} }
    showBest();
    overlay("Sortie trouvée !", "Temps : " + fmt(elapsed) + (record ? ". Nouveau record !" : ". Record : " + fmt(best) + "."), "Rejouer");
  }

  ui.start.addEventListener("click", function () { if (state === "ready" || state === "paused" || state === "won") play(); });
  ui.restart.addEventListener("click", function () { if (document.exitPointerLock) document.exitPointerLock(); if (grid) ready(); });
  ui.mapBtn.addEventListener("click", function () {
    showMini = !showMini; mini.hidden = !showMini; ui.mapBtn.setAttribute("aria-pressed", String(showMini)); if (showMini) needsDraw = true;
  });
  canvas.addEventListener("click", function () {
    if (state === "playing" && !coarse && document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (e) {} }
  });

  /* ------------------------------------------------------------------ */
  /* Commandes                                                          */
  /* ------------------------------------------------------------------ */
  var GAME_KEYS = { KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, ShiftLeft: 1, ShiftRight: 1, Space: 1 };
  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.code === "Escape") { pause(); return; }
    if (e.code === "KeyM" && !e.repeat) { ui.mapBtn.click(); return; }
    if (state === "playing" && GAME_KEYS[e.code]) { keys[e.code] = true; e.preventDefault(); }
  });
  document.addEventListener("keyup", function (e) { if (GAME_KEYS[e.code]) keys[e.code] = false; });
  window.addEventListener("blur", function () { keys = {}; pause(); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) pause(); });

  /* Chrome et Chromium envoient parfois un faux grand mouvement au moment de la capture :
     on ignore les 200 premières ms et tout saut supérieur à 150 pixels. */
  var lockAt = 0;
  document.addEventListener("mousemove", function (e) {
    if (state !== "playing" || document.pointerLockElement !== canvas) return;
    usedLock = true;
    var mx = e.movementX;
    if (performance.now() - lockAt < 200 || Math.abs(mx) > 150) return;
    rotate(mx * MOUSE_SENS);
  });
  document.addEventListener("pointerlockchange", function () {
    if (document.pointerLockElement === canvas) lockAt = performance.now();
    else if (state === "playing" && usedLock) pause();
  });

  /* Tactile : moitié gauche = joystick de déplacement, moitié droite = rotation */
  canvas.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" || state !== "playing") return;
    var left = e.offsetX < canvas.clientWidth / 2;
    if (left && touch.move === null) { touch.move = e.pointerId; touch.sx = e.clientX; touch.sy = e.clientY; }
    else if (!left && touch.turn === null) { touch.turn = e.pointerId; touch.lx = e.clientX; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  });
  canvas.addEventListener("pointermove", function (e) {
    if (e.pointerId === touch.move) {
      touch.mx = clamp((e.clientX - touch.sx) / 50, -1, 1); touch.my = clamp(-(e.clientY - touch.sy) / 50, -1, 1);
    } else if (e.pointerId === touch.turn) {
      rotate((e.clientX - touch.lx) * 0.008); touch.lx = e.clientX;
    }
  });
  function touchEnd(e) {
    if (e.pointerId === touch.move) { touch.move = null; touch.mx = touch.my = 0; }
    if (e.pointerId === touch.turn) touch.turn = null;
  }
  canvas.addEventListener("pointerup", touchEnd);
  canvas.addEventListener("pointercancel", touchEnd);

  /* ------------------------------------------------------------------ */
  /* Démarrage                                                          */
  /* ------------------------------------------------------------------ */
  fetch("/api/wolf/level", { headers: { Accept: "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (level) { parseLevel(level); loadSheet(level.sheet); loadCustom(level.custom_textures); showBest(); ready(); })
    .catch(function () { ui.title.textContent = "Niveau indisponible"; ui.msg.textContent = "Le serveur n'a pas renvoyé le niveau. Rechargez la page."; });

  raf = requestAnimationFrame(tick);

  /* Accès de test : seulement avec ?debug dans l'adresse */
  if (/[?&]debug/.test(location.search)) {
    window.__wolf = {
      get: function () { return { x: p.x, y: p.y, dx: p.dx, dy: p.dy, state: state, elapsed: elapsed, ms: stats.ms }; },
      set: function (x, y, a) { p.x = x; p.y = y; setAngle(a); needsDraw = true; },
      cols: function () { return cols; },
      sheet: function () { return sheetInfo; },
      texAvg: function (id) { var t = textures[id], r = 0, g = 0, b = 0; for (var i = 0; i < t.length; i++) { r += t[i] & 255; g += (t[i] >> 8) & 255; b += (t[i] >> 16) & 255; } return [r / t.length | 0, g / t.length | 0, b / t.length | 0]; }
    };
  }
})();
