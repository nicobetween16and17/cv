/* Faux shell Xterm.js. `python ChessApp.py` lance le jeu : chaque touche part en POST
   vers /api/chesscli/key et le serveur renvoie l'écran en ANSI. Aucune vraie commande
   n'est exécutée : le shell ci-dessous est une petite liste écrite en dur. */
(function () {
  "use strict";
  var host = document.getElementById("term");
  if (!host) return;
  var msg = document.getElementById("cliMsg");
  var frame = host.closest(".term-body") || document.getElementById("cliFrame");
  var COLS = +host.dataset.cols, ROWS = +host.dataset.rows;
  var NAME = host.dataset.name || "visiteur", ROLE = host.dataset.role || "";

  function showMsg(t) { msg.textContent = t || ""; msg.hidden = !t; }
  if (typeof Terminal === "undefined") { showMsg("Xterm.js n'a pas pu être chargé (réseau bloqué ?)."); return; }

  /* Couleurs lues dans les variables CSS du site : même rendu que le terminal de l'accueil. */
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function palette() {
    var bg = cssVar("--term-bg", "#0f1420");
    return { background: bg, foreground: cssVar("--term-fg", "#d7deee"), cursor: cssVar("--term-fg", "#d7deee"), cursorAccent: bg };
  }
  function ansiFg(hex) {
    var m = /^#([0-9a-f]{6})/i.exec(hex || "");
    if (!m) return "\x1b[39m";
    var n = parseInt(m[1], 16);
    return "\x1b[38;2;" + (n >> 16) + ";" + ((n >> 8) & 255) + ";" + (n & 255) + "m";
  }

  var term = new Terminal({
    cols: COLS, rows: ROWS, fontSize: 12, lineHeight: 1, letterSpacing: 0,
    fontFamily: '"JetBrains Mono", "DejaVu Sans Mono", Menlo, Consolas, monospace',
    cursorBlink: true, cursorStyle: "block", scrollback: 0, allowProposedApi: true,
    theme: palette()
  });
  term.open(host);
  try { term.loadAddon(new CanvasAddon.CanvasAddon()); } catch (e) { /* rendu DOM par défaut */ }

  function fit() {
    var availW = frame.clientWidth - 32;
    var top = host.getBoundingClientRect().top;
    var availH = Math.max(260, window.innerHeight - Math.max(top, 0) - 24);
    var size = Math.max(5, Math.min(16, Math.floor(availW / (COLS * 0.6))));
    term.options.fontSize = size;
    var screen = host.querySelector(".xterm-screen");
    for (var i = 0; i < 14 && screen && size > 5 &&
         (screen.offsetWidth > availW || screen.offsetHeight > availH); i++) {
      size -= 1; term.options.fontSize = size;
    }
  }

  /* Deux mises en page : un shell compact qui remplit le cadre (comme le terminal de l'accueil),
     et un grand écran 92x44 pour le plateau, dont la police s'adapte à la fenêtre. */
  var SHELL_ROWS = 12;
  function layoutShell() {
    host.classList.add("is-shell"); host.classList.remove("is-game");
    term.options.fontSize = 13; term.options.lineHeight = 1.5; term.options.scrollback = 200;
    term.resize(60, SHELL_ROWS);
    var screen = host.querySelector(".xterm-screen");
    var cw = screen && screen.offsetWidth ? screen.offsetWidth / 60 : 7.8;
    term.resize(Math.max(30, Math.floor((frame.clientWidth - 32) / cw)), SHELL_ROWS);
  }
  function layoutGame() {
    host.classList.add("is-game"); host.classList.remove("is-shell");
    term.options.lineHeight = 1; term.options.scrollback = 0;
    term.resize(COLS, ROWS);
    fit();
  }
  function relayout() { if (mode === "game") fit(); else layoutShell(); }
  window.addEventListener("resize", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  /* ------------------------------------------------------------------ shell */
  function promptStr() { return ansiFg(cssVar("--term-hl", "#8fb0ff")) + "$ \x1b[0m"; }
  var GREEN = "\x1b[38;2;111;220;165m";
  var FILES = ["ChessApp.py", "README.txt"];
  var README = [
    "ChessApp.py : échecs en terminal contre Stockfish (python-chess).",
    "Lance-le avec :  python ChessApp.py",
    "Tu y choisis le niveau de Stockfish, de 1 (débutant) à 20 (maximum)."
  ];
  var mode = "shell", line = "", history = [], hpos = 0, gen = 0;

  function out(t) { term.write((t === "" ? "" : t) + "\r\n"); }
  var typing = null;
  function prompt(prefill) {
    term.write("\x1b[?25h" + promptStr()); line = "";
    if (prefill) autoType(prefill);
  }
  /* Écrit la commande à la place du visiteur (il n'a plus qu'à faire Entrée). */
  function autoType(text) {
    var i = 0;
    var instant = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function put(c) { line += c; term.write(c); }
    function flush() { if (typing) { clearInterval(typing); typing = null; } while (i < text.length) put(text[i++]); }
    if (instant) { flush(); return; }
    typing = setInterval(function () {
      if (i >= text.length) { clearInterval(typing); typing = null; return; }
      put(text[i++]);
    }, 55);
    autoType.flush = flush;
  }
  function flushTyping() { if (typing && autoType.flush) autoType.flush(); }
  function banner() {
    layoutShell();
    term.write("\x1b[2J\x1b[H\x1b[?25h");
    out("\x1b[1m" + NAME + "\x1b[0m" + (ROLE ? " · " + ROLE : ""));
    out("Faux terminal : aucune vraie commande n'est exécutée ici.");
    out("Appuie sur " + GREEN + "Entrée" + "\x1b[0m pour lancer le jeu, ou tape " + GREEN + "help" + "\x1b[0m.");
    out("");
    prompt("python ChessApp.py");
  }

  var COMMANDS = {
    help: function () {
      out("Commandes : help, ls, cat <fichier>, python ChessApp.py, about, whoami, pwd, clear");
    },
    ls: function () { out(FILES.join("  ")); },
    pwd: function () { out("/home/visiteur"); },
    whoami: function () { out("visiteur"); },
    about: function () { out(NAME + (ROLE ? " : " + ROLE : "")); },
    clear: function () { term.write("\x1b[2J\x1b[H"); },
    cat: function (args) {
      if (!args.length) return out("cat: fichier manquant");
      var f = args[0].toLowerCase();
      if (f === "readme.txt") README.forEach(out);
      else if (f === "chessapp.py") out("cat: ChessApp.py : le code source est sur le dépôt du site, ici on le lance avec python.");
      else out("cat: " + args[0] + " : Aucun fichier ou dossier de ce type");
    },
    python: function (args) {
      if (args.length && args[0].toLowerCase() === "chessapp.py") return startGame();
      if (!args.length) return out("python: précise un script, par exemple : python ChessApp.py");
      out("python: impossible d'ouvrir le fichier '" + args[0] + "' : Aucun fichier ou dossier de ce type");
    }
  };
  COMMANDS.python3 = COMMANDS.python;
  COMMANDS["./chessapp.py"] = function () { startGame(); };

  function run(cmdline) {
    var parts = cmdline.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return;
    var name = parts[0].toLowerCase();
    if (name === "exit" || name === "logout") return out("Il n'y a pas de session à fermer : ferme simplement l'onglet.");
    var fn = COMMANDS[name];
    if (fn) fn(parts.slice(1)); else out(parts[0] + " : commande introuvable (essaie help)");
  }

  function shellInput(tok) {
    flushTyping();
    if (tok === "\r") {
      term.write("\r\n");
      var l = line; line = "";
      if (l.trim()) { history.push(l); if (history.length > 50) history.shift(); }
      hpos = history.length;
      run(l);
      if (mode === "shell") prompt();
    } else if (tok === "\x7f" || tok === "\b") {
      if (line) { line = line.slice(0, -1); term.write("\b \b"); }
    } else if (tok === "\x03") {
      term.write("^C\r\n"); prompt();
    } else if (tok === "\x0c") {
      term.write("\x1b[2J\x1b[H"); term.write(promptStr() + line);
    } else if (tok === "\x1b[A" || tok === "\x1b[B") {
      hpos = Math.max(0, Math.min(history.length, hpos + (tok === "\x1b[A" ? -1 : 1)));
      term.write("\r\x1b[K" + promptStr());
      line = history[hpos] || "";
      term.write(line);
    } else if (tok.length === 1 && tok >= " " && line.length < 80) {
      line += tok; term.write(tok);
    }
  }

  /* ------------------------------------------------------------------- jeu */
  var state = null, queue = [], busy = false;

  function startGame() {
    mode = "game"; gen += 1; state = null; queue = []; busy = false;
    layoutGame();
    term.write("\x1b[2J\x1b[H\x1b[?25l");
    send("\u0000");                 /* touche neutre : le serveur renvoie le menu */
  }

  function stopGame() {
    mode = "shell"; gen += 1; queue = []; busy = false; showMsg("");
    layoutShell();
    term.write("\x1b[0m\x1b[2J\x1b[H\x1b[?25h");
    prompt("python ChessApp.py");
  }

  function send(raw) {
    if (queue.length < 20) queue.push(raw);
    pump();
  }

  function pump() {
    if (mode !== "game" || busy || !queue.length) return;
    busy = true;
    /* Regroupe les touches en attente en une seule requête (flèches maintenues = pas de retard).
       Le tick « Stockfish joue » part toujours seul. */
    var batch = [];
    if (queue[0] === "") batch.push(queue.shift());
    else while (queue.length && queue[0] !== "" && batch.length < 12) batch.push(queue.shift());
    var raw = batch[0], g = gen;
    fetch("/api/chesscli/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: batch, state: state })
    }).then(function (r) {
      if (r.status === 503) throw new Error("busy");
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }).then(function (d) {
      if (g !== gen) return;        /* on a quitté le jeu entre-temps */
      showMsg("");
      state = d.state;
      term.write(d.frame);
      busy = false;
      if (d.tick) queue.unshift("");     /* Stockfish joue au prochain tour */
      pump();
    }).catch(function (e) {
      if (g !== gen) return;
      busy = false;
      if (e.message === "busy") {
        showMsg("Serveur occupé, nouvelle tentative…");
        if (raw === "") queue.unshift(""); else queue = batch.concat(queue);
        setTimeout(pump, 1000);
      } else {
        showMsg("Connexion au serveur perdue. Recharge la page.");
      }
    });
  }

  /* ---------------------------------------------------------------- entrées */
  function handle(data) {
    var toks = data.match(/\x1b\[[0-9;]*[A-Za-z]|\x1bO[A-D]|[\s\S]/g) || [];
    toks.forEach(function (tok) {
      if (mode === "game") {
        if (tok === "\x03") stopGame(); else send(tok);
      } else {
        shellInput(tok);
      }
    });
  }

  term.onData(handle);
  document.querySelectorAll(".cli-pad [data-key]").forEach(function (b) {
    b.addEventListener("click", function () { handle(b.dataset.key); term.focus(); });
  });

  /* Suit le thème clair/sombre du site. */
  function retheme() { term.options.theme = palette(); }
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retheme);

  banner();
  term.focus();
})();
