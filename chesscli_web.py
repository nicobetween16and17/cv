import threading

from flask import Blueprint, jsonify, redirect, render_template, request, url_for

import chess_cli

bp = Blueprint("chesscli", __name__)
_slots = threading.BoundedSemaphore(2)      # au plus 2 Stockfish en même temps


@bp.get("/ChessCLI")
def page():
    return render_template("chesscli.html", cols=chess_cli.COLS, rows=chess_cli.ROWS)


@bp.get("/chesscli")
def alias():
    return redirect(url_for("chesscli.page"))


@bp.post("/api/chesscli/key")
def key():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Corps JSON attendu."), 400
    raw = data.get("key", "")
    if not isinstance(raw, str) or len(raw) > 8:
        return jsonify(error="Touche invalide."), 400

    state = data.get("state")
    game = chess_cli.Game.from_dict(state) if isinstance(state, dict) else chess_cli.Game()
    key_name = chess_cli.translate_key(raw)

    if key_name == chess_cli.TICK and game.engine_pending:
        if not _slots.acquire(timeout=5):
            return jsonify(error="Serveur occupé, nouvelle tentative…"), 503
        try:
            game.handle_key(key_name)
        finally:
            _slots.release()
    else:
        game.handle_key(key_name)

    return jsonify(state=game.to_dict(), frame=game.frame(), tick=game.engine_pending)
