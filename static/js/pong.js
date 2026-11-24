/* Pong : vous (gauche) contre l'ordinateur (droite). Premier à 7 points. */
(function () {
  "use strict";

  var canvas = document.getElementById("pong");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var W = canvas.width, H = canvas.height;
  var PADDLE_W = 12, PADDLE_H = 90, BALL_R = 8, MARGIN = 24;
  var WIN_POINTS = 7, MAX_BALL_SPEED = 760, SERVE_DELAY = 0.8;
  var PLAYER_KEY_SPEED = 540;

  /* Réglages par niveau : vitesse de l'IA, vitesse de balle, bonus de score, erreur de visée */
  var LEVELS = {
    facile:    { ai: 230, ball: 320, bonus: 0,   err: 60 },
    normal:    { ai: 310, ball: 380, bonus: 100, err: 35 },
    difficile: { ai: 420, ball: 440, bonus: 250, err: 12 }
  };

  var ui = {
    level: document.getElementById("level"),
    play: document.getElementById("btnPlay"),
    reset: document.getElementById("btnReset"),
    result: document.getElementById("result"),
    resultText: document.getElementById("resultText"),
    form: document.getElementById("scoreForm"),
    pseudo: document.getElementById("pseudo"),
    msg: document.getElementById("formMsg"),
    board: document.getElementById("board")
  };

  var state = {
    mode: "ready",           // ready | playing | paused | over
    player: { y: (H - PADDLE_H) / 2, score: 0 },
    ai: { y: (H - PADDLE_H) / 2, score: 0, offset: 0 },
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: 0 },
    serveTimer: 0,
    rally: 0,
    bestRally: 0,
    keys: { up: false, down: false },
    lastScore: 0,
    lastLevel: "normal",
    submitted: false
  };

  function level() { return LEVELS[ui.level.value] || LEVELS.normal; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* Couleurs lues dans la feuille de style, pour suivre le thème */
  function palette() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) { return cs.getPropertyValue(name).trim() || fallback; }
    return {
      bg: v("--term-bg", "#0f1420"), fg: v("--term-fg", "#d7deee"),
      dim: v("--term-dim", "#7f8aa3"), hl: v("--term-hl", "#8fb0ff")
    };
  }

  function resetBall(towardPlayer) {
    var b = state.ball;
    b.x = W / 2; b.y = H / 2;
    b.speed = level().ball;
    var angle = (Math.random() * 2 - 1) * 0.5;
    var dir = towardPlayer ? -1 : 1;
    b.vx = dir * b.speed * Math.cos(angle);
    b.vy = b.speed * Math.sin(angle);
    state.serveTimer = SERVE_DELAY;
    state.rally = 0;
  }

  function newMatch() {
    state.player.score = 0; state.ai.score = 0;
    state.player.y = (H - PADDLE_H) / 2; state.ai.y = (H - PADDLE_H) / 2;
    state.bestRally = 0; state.submitted = false;
    ui.result.hidden = true; ui.form.hidden = true; ui.msg.textContent = "";
    resetBall(Math.random() < 0.5);
    state.mode = "ready";
    syncButtons();
  }

  function syncButtons() {
    ui.play.textContent = state.mode === "playing" ? "Pause" : (state.mode === "paused" ? "Reprendre" : "Jouer");
  }

  function togglePlay() {
    if (state.mode === "over") { newMatch(); state.mode = "playing"; }
    else if (state.mode === "ready" || state.mode === "paused") { state.mode = "playing"; }
    else if (state.mode === "playing") { state.mode = "paused"; }
    syncButtons();
  }

  /* ---------- Mise à jour ---------- */
  function hitPaddle(paddleY, dir) {
    var b = state.ball;
    var rel = clamp((b.y - (paddleY + PADDLE_H / 2)) / (PADDLE_H / 2), -1, 1);
    var angle = rel * 0.95;
    b.speed = Math.min(b.speed * 1.05, MAX_BALL_SPEED);
    b.vx = dir * b.speed * Math.cos(angle);
    b.vy = b.speed * Math.sin(angle);
    state.rally += 1;
    if (state.rally > state.bestRally) state.bestRally = state.rally;
    state.ai.offset = (Math.random() * 2 - 1) * level().err;
  }

  function point(playerScored) {
    if (playerScored) state.player.score += 1; else state.ai.score += 1;
    if (state.player.score >= WIN_POINTS || state.ai.score >= WIN_POINTS) { endMatch(); return; }
    resetBall(!playerScored);
  }

  function update(dt) {
    var p = state.player, a = state.ai, b = state.ball, lv = level();

    var dir = (state.keys.down ? 1 : 0) - (state.keys.up ? 1 : 0);
    if (dir) p.y = clamp(p.y + dir * PLAYER_KEY_SPEED * dt, 0, H - PADDLE_H);

    var target = b.vx > 0 ? b.y + a.offset : H / 2;
    var diff = target - (a.y + PADDLE_H / 2);
    if (Math.abs(diff) > 6) a.y = clamp(a.y + clamp(diff, -lv.ai * dt, lv.ai * dt), 0, H - PADDLE_H);

    if (state.serveTimer > 0) { state.serveTimer -= dt; return; }

    b.x += b.vx * dt; b.y += b.vy * dt;

    if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
    if (b.y > H - BALL_R) { b.y = H - BALL_R; b.vy = -Math.abs(b.vy); }

    var pLeft = MARGIN, pRight = MARGIN + PADDLE_W;
    if (b.vx < 0 && b.x - BALL_R <= pRight && b.x + BALL_R >= pLeft &&
        b.y >= p.y - BALL_R && b.y <= p.y + PADDLE_H + BALL_R) {
      b.x = pRight + BALL_R;
      hitPaddle(p.y, 1);
    }
    var aLeft = W - MARGIN - PADDLE_W, aRight = W - MARGIN;
    if (b.vx > 0 && b.x + BALL_R >= aLeft && b.x - BALL_R <= aRight &&
        b.y >= a.y - BALL_R && b.y <= a.y + PADDLE_H + BALL_R) {
      b.x = aLeft - BALL_R;
      hitPaddle(a.y, -1);
    }

    if (b.x < -BALL_R) point(false);
    else if (b.x > W + BALL_R) point(true);
  }

  /* ---------- Fin de partie et score ---------- */
  function endMatch() {
    state.mode = "over";
    syncButtons();
    var lv = ui.level.value, won = state.player.score > state.ai.score;
    state.lastLevel = lv;
    ui.result.hidden = false;
    if (won) {
      var margin = state.player.score - state.ai.score;
      state.lastScore = margin * 100 + state.bestRally * 10 + level().bonus;
      ui.resultText.textContent = "Victoire " + state.player.score + " à " + state.ai.score + ". Score : " + state.lastScore + " points.";
      ui.form.hidden = false;
      try { var saved = localStorage.getItem("pong-name"); if (saved && !ui.pseudo.value) ui.pseudo.value = saved; } catch (e) {}
    } else {
      state.lastScore = 0;
      ui.resultText.textContent = "Défaite " + state.player.score + " à " + state.ai.score + ". Retentez votre chance.";
      ui.form.hidden = true;
    }
  }

  function showMessage(text, isError) {
    ui.msg.textContent = text;
    ui.msg.classList.toggle("err", !!isError);
  }

  function renderBoard(rows) {
    ui.board.textContent = "";
    if (!rows.length) {
      var li = document.createElement("li"); li.className = "empty";
      li.textContent = "Aucun score pour l'instant. Soyez le premier.";
      ui.board.appendChild(li); return;
    }
    rows.forEach(function (r) {
      var li = document.createElement("li");
      var who = document.createElement("span"); who.className = "who"; who.textContent = r.name;
      var lvl = document.createElement("span"); lvl.className = "lvl"; lvl.textContent = r.level;
      var pts = document.createElement("span"); pts.className = "pts"; pts.textContent = r.score;
      li.append(who, lvl, pts); ui.board.appendChild(li);
    });
  }

  function loadBoard() {
    fetch("/api/scores", { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(renderBoard)
      .catch(function () {
        ui.board.textContent = "";
        var li = document.createElement("li"); li.className = "empty";
        li.textContent = "Classement indisponible pour le moment.";
        ui.board.appendChild(li);
      });
  }

  ui.form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (state.submitted || state.lastScore <= 0) return;
    var name = ui.pseudo.value.trim();
    showMessage("Envoi…", false);
    fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ name: name, score: state.lastScore, level: state.lastLevel })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok) { showMessage(res.data.error || "Envoi impossible.", true); return; }
        state.submitted = true;
        try { localStorage.setItem("pong-name", name); } catch (err) {}
        showMessage("Score enregistré.", false);
        renderBoard(res.data.scores || []);
        ui.form.hidden = true;
      })
      .catch(function () { showMessage("Le serveur ne répond pas.", true); });
  });

  /* ---------- Dessin ---------- */
  function draw() {
    var c = palette();
    ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = c.dim; ctx.lineWidth = 3; ctx.setLineDash([10, 14]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);

    ctx.fillStyle = c.dim; ctx.font = "600 56px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText(String(state.player.score), W / 2 - 80, 70);
    ctx.fillText(String(state.ai.score), W / 2 + 80, 70);

    ctx.fillStyle = c.hl; ctx.fillRect(MARGIN, state.player.y, PADDLE_W, PADDLE_H);
    ctx.fillStyle = c.fg; ctx.fillRect(W - MARGIN - PADDLE_W, state.ai.y, PADDLE_W, PADDLE_H);

    ctx.fillStyle = c.fg; ctx.beginPath(); ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2); ctx.fill();

    ctx.font = "500 14px 'JetBrains Mono', monospace"; ctx.fillStyle = c.dim;
    ctx.fillText("Échange " + state.rally + "  ·  record " + state.bestRally, W / 2, H - 16);

    var overlay = null;
    if (state.mode === "ready") overlay = "Espace ou bouton Jouer pour commencer";
    else if (state.mode === "paused") overlay = "Pause";
    if (overlay) {
      ctx.fillStyle = c.fg; ctx.font = "600 22px 'JetBrains Mono', monospace";
      ctx.fillText(overlay, W / 2, H / 2 - 40);
    }
  }

  /* ---------- Boucle ---------- */
  var last = 0;
  function frame(t) {
    var dt = Math.min((t - last) / 1000, 0.033);
    last = t;
    if (state.mode === "playing") update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* ---------- Commandes ---------- */
  function movePaddleTo(clientY) {
    var rect = canvas.getBoundingClientRect();
    var y = (clientY - rect.top) * (H / rect.height) - PADDLE_H / 2;
    state.player.y = clamp(y, 0, H - PADDLE_H);
  }
  canvas.addEventListener("pointermove", function (e) { movePaddleTo(e.clientY); });
  canvas.addEventListener("pointerdown", function (e) {
    movePaddleTo(e.clientY);
    if (state.mode === "ready" || state.mode === "paused") togglePlay();
  });

  function typing(e) { var t = e.target && e.target.tagName; return t === "INPUT" || t === "SELECT" || t === "TEXTAREA"; }
  document.addEventListener("keydown", function (e) {
    if (typing(e)) return;
    var k = e.key;
    if (k === "ArrowUp" || k === "w" || k === "W" || k === "z" || k === "Z") { state.keys.up = true; e.preventDefault(); }
    else if (k === "ArrowDown" || k === "s" || k === "S") { state.keys.down = true; e.preventDefault(); }
    else if (k === " ") { e.preventDefault(); if (!e.repeat) togglePlay(); }
  });
  document.addEventListener("keyup", function (e) {
    var k = e.key;
    if (k === "ArrowUp" || k === "w" || k === "W" || k === "z" || k === "Z") state.keys.up = false;
    else if (k === "ArrowDown" || k === "s" || k === "S") state.keys.down = false;
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && state.mode === "playing") { state.mode = "paused"; syncButtons(); }
  });

  ui.play.addEventListener("click", togglePlay);
  ui.reset.addEventListener("click", newMatch);
  ui.level.addEventListener("change", newMatch);

  newMatch();
  loadBoard();
  requestAnimationFrame(function (t) { last = t; frame(t); });
})();
