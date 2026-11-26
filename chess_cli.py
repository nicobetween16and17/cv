"""Échecs en ligne de commande contre Stockfish (python-chess).

Le même code sert à deux endroits :
  * dans un vrai terminal :  python chess_cli.py          (pip install chess readchar)
  * sur le site (page /ChessCLI, terminal Xterm.js) via chesscli_web.py

Pour que ça marche aux deux endroits, rien ici ne lit le clavier ni n'écrit à
l'écran en direct : `Game` est une machine à états (touche -> nouvel état) et
`Game.frame()` renvoie l'écran sous forme de texte ANSI. Les pièces sont dessinées
en « demi-pixels » (caractère ▀ : couleur du texte = pixel du haut, couleur de
fond = pixel du bas), donc 3 couleurs par case : contour, remplissage, case.
"""
from __future__ import annotations

import os
import shutil
import sys

import chess

# --------------------------------------------------------------------------
# Réglages
# --------------------------------------------------------------------------
CELL_W, CELL_H = 11, 5          # une case = 11 colonnes x 5 lignes de texte (= 11 x 10 pixels)
COLS, ROWS = 3 + 8 * CELL_W + 1, 46   # taille de terminal nécessaire

# (niveau Stockfish "Skill Level" 0-20, ou None pour 2 joueurs, libellé)
MODES = [
    (None, "2 joueurs (local)"),
    (1, "Stockfish niveau 1  (débutant)"),
    (3, "Stockfish niveau 3  (facile)"),
    (5, "Stockfish niveau 5  (intermédiaire)"),
    (8, "Stockfish niveau 8  (avancé)"),
    (10, "Stockfish niveau 10 (expert)"),
    (15, "Stockfish niveau 15 (maître)"),
    (20, "Stockfish niveau 20 (maximum)"),
]
PROMOTIONS = [(chess.QUEEN, "Dame"), (chess.ROOK, "Tour"), (chess.BISHOP, "Fou"), (chess.KNIGHT, "Cavalier")]
MAX_PLIES = 800

TICK = "TICK"   # « avance » : sert à laisser Stockfish jouer après l'affichage de « réfléchit… »

# --------------------------------------------------------------------------
# Pièces : 11 x 10 pixels.  . = case   o = contour   f = remplissage   h = reflet
# --------------------------------------------------------------------------
SPRITES = {
    "P": [
        "...........",
        "....ooo....",
        "...ohffo...",
        "...offfo...",
        "....ooo....",
        "....ofo....",
        "...offfo...",
        "..ohffffo..",
        ".offfffffo.",
        ".ooooooooo.",
    ],
    "R": [
        "...........",
        ".oo.ooo.oo.",
        ".ooofffooo.",
        "..ohffffo..",
        "...ohffo...",
        "...offfo...",
        "...offfo...",
        "..offfffo..",
        ".offfffffo.",
        ".ooooooooo.",
    ],
    "N": [
        "...o.oo....",
        "..ofooffo..",
        ".ofhfffffo.",
        "ofoofffffo.",
        "offfffffo..",
        ".ooofffffo.",
        "...offfffo.",
        "..offffffo.",
        ".offfffffo.",
        ".ooooooooo.",
    ],
    "B": [
        ".....o.....",
        "....ofo....",
        "...ohffo...",
        "...offfo...",
        "...offfo...",
        "..ooooooo..",
        "...ofhfo...",
        "..offfffo..",
        ".offfffffo.",
        ".ooooooooo.",
    ],
    "Q": [
        ".o...o...o.",
        ".o.o.o.o.o.",
        ".ofofofofo.",
        "..offfffo..",
        "...ohffo...",
        "...offfo...",
        "...offfo...",
        "..offfffo..",
        ".offfffffo.",
        ".ooooooooo.",
    ],
    "K": [
        ".....o.....",
        "....ofo....",
        ".....o.....",
        "..oo.o.oo..",
        ".ofoofoofo.",
        "..ohffffo..",
        "...offfo...",
        "..offfffo..",
        ".offfffffo.",
        ".ooooooooo.",
    ],
}
for _name, _rows in SPRITES.items():
    assert len(_rows) == CELL_H * 2 and all(len(r) == CELL_W for r in _rows), _name

MARKER = ["...........", "...........", "...........", "....ddd....", "...ddddd...",
          "...ddddd...", "....ddd....", "...........", "...........", "..........."]

# --------------------------------------------------------------------------
# Couleurs (R, G, B)
# --------------------------------------------------------------------------
SQUARE = {True: (181, 181, 168), False: (92, 122, 68)}              # clair / foncé
CURSOR, SELECTED = (212, 172, 13), (154, 125, 10)
TARGET = {True: (169, 204, 227), False: (84, 153, 199)}
LAST = {True: (205, 210, 106), False: (170, 162, 58)}
CHECK = (200, 70, 60)
PIECE = {
    chess.WHITE: {"o": (26, 26, 26), "f": (240, 234, 216), "h": (255, 255, 255)},
    chess.BLACK: {"o": (8, 8, 10), "f": (58, 58, 68), "h": (130, 130, 146)},
}
MARK = (44, 62, 80)
DIM, ACCENT, WARN = (140, 146, 158), (86, 182, 194), (224, 108, 117)

# --------------------------------------------------------------------------
# Petit moteur de rendu ANSI
# --------------------------------------------------------------------------
RESET = "\x1b[0m"


def _fg(c):
    return "\x1b[39m" if c is None else f"\x1b[38;2;{c[0]};{c[1]};{c[2]}m"


def _bg(c):
    return "\x1b[49m" if c is None else f"\x1b[48;2;{c[0]};{c[1]};{c[2]}m"


def emit(cells) -> str:
    """cells = [(caractère, couleur_texte, couleur_fond)] -> texte ANSI, sans répéter les codes inutiles."""
    out, cur_fg, cur_bg = [], "?", "?"
    for ch, f, b in cells:
        if b != cur_bg:
            out.append(_bg(b))
            cur_bg = b
        if ch != " " and f != cur_fg:
            out.append(_fg(f))
            cur_fg = f
        out.append(ch)
    out.append(RESET)
    return "".join(out)


def styled(text, fg=None, bg=None, bold=False) -> str:
    return ("\x1b[1m" if bold else "") + (_fg(fg) if fg else "") + (_bg(bg) if bg else "") + text + RESET


def text_cells(text, fg=None, bg=None):
    return [(ch, fg, bg) for ch in text]


# --------------------------------------------------------------------------
# Touches : on normalise ce que renvoient readchar / xterm.js
# --------------------------------------------------------------------------
_SPECIAL = {
    "\x1b[A": "UP", "\x1bOA": "UP", "\x1b[B": "DOWN", "\x1bOB": "DOWN",
    "\x1b[C": "RIGHT", "\x1bOC": "RIGHT", "\x1b[D": "LEFT", "\x1bOD": "LEFT",
    "\r": "ENTER", "\n": "ENTER", "\x1b": "ESC",
}
_ALIASES = {"w": "UP", "z": "UP", "s": "DOWN", "a": "LEFT", "q": "LEFT", "d": "RIGHT"}


def translate_key(raw: str):
    """Touche brute -> 'UP' 'DOWN' 'LEFT' 'RIGHT' 'ENTER' 'ESC' TICK 'u' 'm'… ou None."""
    if raw == "":
        return TICK
    if raw in _SPECIAL:
        return _SPECIAL[raw]
    if len(raw) == 1 and raw.isprintable():
        return _ALIASES.get(raw.lower(), raw.lower())
    return None


# --------------------------------------------------------------------------
# Stockfish
# --------------------------------------------------------------------------
def find_stockfish() -> str:
    candidates = [
        os.environ.get("STOCKFISH_PATH"),
        shutil.which("stockfish"),
        "/usr/games/stockfish",          # Debian / Ubuntu / Linux Mint
        "/usr/bin/stockfish",
        "/opt/homebrew/bin/stockfish",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "engines", "stockfish"),
    ]
    for path in candidates:
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    raise FileNotFoundError(
        "Stockfish introuvable. Linux : sudo apt install stockfish — ou définis la variable STOCKFISH_PATH."
    )


def stockfish_move(board: "chess.Board", level: int) -> "chess.Move":
    """Lance Stockfish le temps d'un coup (pas de processus qui traîne côté serveur)."""
    import chess.engine

    with chess.engine.SimpleEngine.popen_uci(find_stockfish(), timeout=15) as engine:
        wanted = {"Threads": 1, "Hash": 16}
        skill = engine.options.get("Skill Level")
        if skill is not None:
            wanted["Skill Level"] = max(skill.min, min(skill.max, level))
        engine.configure({k: v for k, v in wanted.items() if k in engine.options})
        return engine.play(board, chess.engine.Limit(time=0.05 + 0.02 * level)).move


# --------------------------------------------------------------------------
# La partie (état sérialisable : le serveur ne garde rien en mémoire)
# --------------------------------------------------------------------------
_TERMINATIONS = {
    "CHECKMATE": "Échec et mat", "STALEMATE": "Pat", "INSUFFICIENT_MATERIAL": "Matériel insuffisant",
    "SEVENTYFIVE_MOVES": "Règle des 75 coups", "FIVEFOLD_REPETITION": "Répétition (5 fois)",
    "FIFTY_MOVES": "Règle des 50 coups", "THREEFOLD_REPETITION": "Triple répétition",
}


class Game:
    def __init__(self):
        self.phase = "menu"          # menu | play | over
        self.menu = 1
        self.level = None
        self.board = chess.Board()
        self.cursor = (4, 1)         # (colonne, rangée) 0-7
        self.sel = None              # case sélectionnée
        self.promo = None            # (de, vers) en attente du choix de la pièce
        self.promo_idx = 0
        self.err = ""
        self.outcome = None

    # ---- (dé)sérialisation, avec validation : le client est libre d'envoyer n'importe quoi
    def to_dict(self):
        return {
            "phase": self.phase, "menu": self.menu, "level": self.level,
            "moves": [m.uci() for m in self.board.move_stack],
            "cursor": list(self.cursor), "sel": self.sel,
            "promo": list(self.promo) if self.promo else None, "promo_idx": self.promo_idx,
            "err": self.err,
        }

    @classmethod
    def from_dict(cls, d):
        g = cls()
        try:
            phase = d.get("phase")
            level = d.get("level")
            moves = d.get("moves", [])
            if phase not in ("menu", "play", "over") or not isinstance(moves, list) or len(moves) > MAX_PLIES:
                return g
            if level is not None and (not isinstance(level, int) or isinstance(level, bool) or not 0 <= level <= 20):
                return g
            for uci in moves:
                g.board.push_uci(str(uci))          # ValueError si coup illégal -> partie neuve
            g.phase, g.level = phase, level
            g.menu = max(0, min(len(MODES) - 1, int(d.get("menu", 1))))
            c, r = d.get("cursor", [4, 1])
            g.cursor = (max(0, min(7, int(c))), max(0, min(7, int(r))))
            sel = d.get("sel")
            g.sel = sel if isinstance(sel, int) and 0 <= sel < 64 else None
            promo = d.get("promo")
            if isinstance(promo, list) and len(promo) == 2 and all(isinstance(x, int) and 0 <= x < 64 for x in promo):
                g.promo = (promo[0], promo[1])
            g.promo_idx = max(0, min(len(PROMOTIONS) - 1, int(d.get("promo_idx", 0))))
            g.err = str(d.get("err", ""))[:200]
            g.outcome = g.board.outcome(claim_draw=True)
            if g.phase == "play" and g.outcome:
                g.phase = "over"
            return g
        except (ValueError, TypeError, AttributeError):
            return cls()

    # ---- état dérivé
    @property
    def engine_pending(self) -> bool:
        return (self.phase == "play" and self.level is not None and self.outcome is None
                and self.board.turn == chess.BLACK)

    def _after_move(self):
        self.sel, self.promo, self.promo_idx = None, None, 0
        self.outcome = self.board.outcome(claim_draw=True)
        if self.outcome:
            self.phase = "over"

    def _targets(self):
        if self.sel is None:
            return set()
        return {m.to_square for m in self.board.legal_moves if m.from_square == self.sel}

    # ---- une touche = un nouvel état
    def handle_key(self, key):
        if key is None:
            return
        if key == TICK:
            if self.engine_pending:
                try:
                    self.board.push(stockfish_move(self.board, self.level))
                    self.err = ""
                    self._after_move()
                except Exception as exc:  # moteur absent, timeout, processus mort…
                    self.err = f"Stockfish indisponible : {exc}"[:200]
                    self.phase = "menu"
            return
        if self.engine_pending:
            return
        if self.phase == "menu":
            return self._key_menu(key)
        if self.phase == "over":
            if key == "ENTER":
                self.phase = "menu"
            return
        return self._key_play(key)

    def _key_menu(self, key):
        if key == "UP":
            self.menu = (self.menu - 1) % len(MODES)
        elif key == "DOWN":
            self.menu = (self.menu + 1) % len(MODES)
        elif key == "ENTER":
            self.board = chess.Board()
            self.level = MODES[self.menu][0]
            self.phase, self.cursor, self.sel, self.promo, self.outcome, self.err = "play", (4, 1), None, None, None, ""

    def _key_play(self, key):
        if self.promo is not None:
            if key == "ESC":
                self.promo = None
            elif key == "LEFT":
                self.promo_idx = (self.promo_idx - 1) % len(PROMOTIONS)
            elif key == "RIGHT":
                self.promo_idx = (self.promo_idx + 1) % len(PROMOTIONS)
            elif key == "ENTER":
                frm, to = self.promo
                self.board.push(chess.Move(frm, to, promotion=PROMOTIONS[self.promo_idx][0]))
                self._after_move()
            return
        col, row = self.cursor
        if key == "ESC":
            self.sel = None
        elif key == "m":
            self.phase = "menu"
        elif key == "u":
            self._undo()
        elif key == "ENTER":
            self._select(chess.square(col, row))
        elif key == "UP":
            self.cursor = (col, min(7, row + 1))
        elif key == "DOWN":
            self.cursor = (col, max(0, row - 1))
        elif key == "LEFT":
            self.cursor = (max(0, col - 1), row)
        elif key == "RIGHT":
            self.cursor = (min(7, col + 1), row)

    def _undo(self):
        # contre Stockfish on reprend deux demi-coups (le sien et le tien)
        for _ in range(2 if self.level is not None else 1):
            if self.board.move_stack:
                self.board.pop()
        self.outcome, self.sel = None, None

    def _select(self, square):
        piece = self.board.piece_at(square)
        if piece and piece.color == self.board.turn:
            self.sel = square
            return
        if self.sel is not None:
            if chess.Move(self.sel, square, promotion=chess.QUEEN) in self.board.legal_moves:
                self.promo, self.sel = (self.sel, square), None
                return
            move = chess.Move(self.sel, square)
            if move in self.board.legal_moves:
                self.board.push(move)
                self._after_move()
                return
        self.sel = None

    # ---- affichage
    def frame(self) -> str:
        lines = self._menu_lines() if self.phase == "menu" else self._board_lines()
        lines = lines[:ROWS]
        return "\x1b[H" + "".join(line + "\x1b[K\r\n" for line in lines[:-1]) + lines[-1] + "\x1b[K\x1b[J"

    def _menu_lines(self):
        lines = [styled("  ÉCHECS · pixel CLI", ACCENT, bold=True), "",
                 styled("  Choisis ton adversaire (↑/↓ puis Entrée) :", None, bold=True), ""]
        for i, (_, label) in enumerate(MODES):
            if i == self.menu:
                lines.append(styled(f"   ▶ {label} ", (20, 20, 20), ACCENT, bold=True))
            else:
                lines.append(f"     {label}")
        lines += ["", styled("  Tu joues les Blancs. Stockfish « Skill Level » : 0 = très faible, 20 = maximum.", DIM)]
        if self.err:
            lines += ["", styled("  " + self.err, WARN)]
        return lines

    def _status(self):
        if self.phase == "over" and self.outcome:
            what = _TERMINATIONS.get(self.outcome.termination.name, self.outcome.termination.name.replace("_", " ").title())
            who = {True: " — les Blancs gagnent", False: " — les Noirs gagnent"}.get(self.outcome.winner, " — partie nulle")
            return styled(f"{what}{who}.  Entrée : rejouer", ACCENT, bold=True)
        if self.engine_pending:
            return styled(f"Stockfish (niv. {self.level}) réfléchit…", ACCENT, bold=True)
        side = "Blancs" if self.board.turn == chess.WHITE else "Noirs"
        check = styled("  Échec !", WARN, bold=True) if self.board.is_check() else ""
        return styled(f"Tour : {side}", ACCENT, bold=True) + check

    def _board_lines(self):
        targets = self._targets()
        last = self.board.move_stack[-1] if self.board.move_stack else None
        king = self.board.king(self.board.turn) if self.board.is_check() else None
        cur_sq = chess.square(*self.cursor)
        who = "2 joueurs" if self.level is None else f"vs Stockfish niveau {self.level}"
        lines = [styled(f" ÉCHECS · {who}", ACCENT, bold=True)]

        for row in range(7, -1, -1):
            for line in range(CELL_H):
                cells = text_cells(f" {row + 1} " if line == 2 else "   ", DIM, None)
                for col in range(8):
                    sq = chess.square(col, row)
                    light = (row + col) % 2 == 1
                    if sq == cur_sq:
                        base = CURSOR
                    elif sq == self.sel:
                        base = SELECTED
                    elif sq in targets:
                        base = TARGET[light]
                    elif sq == king:
                        base = CHECK
                    elif last and sq in (last.from_square, last.to_square):
                        base = LAST[light]
                    else:
                        base = SQUARE[light]
                    piece = self.board.piece_at(sq)
                    if piece:
                        sprite, colors = SPRITES[piece.symbol().upper()], PIECE[piece.color]
                    elif sq in targets:
                        sprite, colors = MARKER, {"d": MARK}
                    else:
                        sprite, colors = None, {}
                    for x in range(CELL_W):
                        top = colors.get(sprite[2 * line][x], base) if sprite else base
                        bot = colors.get(sprite[2 * line + 1][x], base) if sprite else base
                        cells.append((" ", None, top) if top == bot else ("▀", top, bot))
                lines.append(emit(cells))
        lines.append(emit(text_cells("   " + "".join(f"     {c}     " for c in "abcdefgh"), DIM, None)))
        lines.append("")
        lines.append(self._status())
        if self.promo is not None:
            bar = styled(" Promotion (←/→ puis Entrée) : ", (224, 190, 80), bold=True)
            for i, (_, name) in enumerate(PROMOTIONS):
                bar += styled(f" {name} ", (20, 20, 20), (224, 190, 80), bold=True) if i == self.promo_idx else styled(f" {name} ", DIM)
                bar += " "
            lines.append(bar)
        else:
            lines.append(styled(" Flèches / ZQSD : déplacer · Entrée : choisir · Échap : annuler · U : reprendre · M : menu · Ctrl-C : quitter", DIM))
        return lines


# --------------------------------------------------------------------------
# Lancement dans un vrai terminal : python chess_cli.py
# --------------------------------------------------------------------------
def main() -> None:
    import readchar

    game = Game()
    out = sys.stdout
    out.write("\x1b[?25l\x1b[2J")          # cache le curseur, efface l'écran
    try:
        while True:
            out.write(game.frame())
            out.flush()
            if game.engine_pending:
                game.handle_key(TICK)
                continue
            key = readchar.readkey()
            if key == "\x03":               # Ctrl-C
                break
            game.handle_key(translate_key(key))
    except KeyboardInterrupt:
        pass
    finally:
        out.write(RESET + "\x1b[?25h\x1b[2J\x1b[H")
        out.flush()


if __name__ == "__main__":
    main()
