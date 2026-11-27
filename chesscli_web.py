"""Page /ChessCLI : le jeu de chess_cli.py affiché dans un terminal Xterm.js.

Pas de WebSocket (PythonAnywhere n'en propose pas) : le navigateur envoie les touches
en POST, le serveur rejoue la partie reçue, applique les touches et renvoie l'écran en
ANSI (compressé en gzip). Le serveur ne garde aucun état en mémoire.
"""
import gzip
import json
import threading

from flask import Blueprint, Response, jsonify, redirect, render_template, request, url_for

import chess_cli

bp = Blueprint("chesscli", __name__)
_slots = threading.BoundedSemaphore(2)      # au plus 2 Stockfish en même temps
MAX_KEYS = 16


@bp.get("/ChessCLI")
def page():
    return render_template("chesscli.html", cols=chess_cli.COLS, rows=chess_cli.ROWS)


@bp.get("/chesscli")
def alias():
    return redirect(url_for("chesscli.page"))


def _reply(payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    resp = Response(body, status=status, mimetype="application/json")
    if "gzip" in request.headers.get("Accept-Encoding", "") and len(body) > 1000:
        resp.set_data(gzip.compress(body, 5))     # l'écran est très répétitif : ~10x plus petit
        resp.headers["Content-Encoding"] = "gzip"
    resp.headers["Vary"] = "Accept-Encoding"
    return resp


@bp.post("/api/chesscli/key")
def key():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Corps JSON attendu."), 400

    keys = data.get("keys")
    if keys is None:
        keys = [data.get("key", "")]
    if (not isinstance(keys, list) or not 0 < len(keys) <= MAX_KEYS
            or not all(isinstance(k, str) and len(k) <= 8 for k in keys)):
        return jsonify(error="Touches invalides."), 400

    state = data.get("state")
    game = chess_cli.Game.from_dict(state) if isinstance(state, dict) else chess_cli.Game()

    for raw in keys:
        name = chess_cli.translate_key(raw)
        if name == chess_cli.TICK and game.engine_pending:
            if not _slots.acquire(timeout=5):
                return jsonify(error="Serveur occupé, nouvelle tentative…"), 503
            try:
                game.handle_key(name)
            finally:
                _slots.release()
        else:
            game.handle_key(name)

    return _reply({"state": game.to_dict(), "frame": game.frame(), "tick": game.engine_pending})
