"""CV étudiant en informatique : serveur Flask avec un Pong et un classement.

Lancement local :   python app.py
Sur PythonAnywhere : voir README.md (le fichier WSGI importe `app`).
"""
import hashlib
import json
import os
import re
import sqlite3
import time
from pathlib import Path

from flask import Flask, abort, g, jsonify, render_template, request, url_for

BASE_DIR = Path(__file__).resolve().parent
CV_PATH = BASE_DIR / "data" / "cv.json"
DB_PATH = Path(os.environ.get("PONG_DB", BASE_DIR / "data" / "pong.sqlite3"))
SCORE_SALT = os.environ.get("SCORE_SALT", "changez-moi")

LEVELS = ("facile", "normal", "difficile")
MAX_SCORE = 5000
MIN_SECONDS_BETWEEN_SCORES = 20
NAME_RE = re.compile(r"[\w .\-]{1,16}")

app = Flask(__name__)
app.json.ensure_ascii = False

# Page d'échecs en terminal : optionnelle, le reste du site marche même sans `pip install chess`.
try:
    from chesscli_web import bp as chesscli_bp

    app.register_blueprint(chesscli_bp)
    app.config["CHESSCLI"] = True
except ImportError as exc:
    print(f"[chesscli] page désactivée : {exc}")
    app.config["CHESSCLI"] = False


# --------------------------------------------------------------------------
# Données du CV
# --------------------------------------------------------------------------
def load_cv():
    with CV_PATH.open(encoding="utf-8") as f:
        return json.load(f)


@app.context_processor
def inject_globals():
    def asset(filename):
        """URL d'un fichier statique avec un numéro de version (évite le cache périmé)."""
        try:
            version = int((BASE_DIR / "static" / filename).stat().st_mtime)
        except OSError:
            version = 0
        return url_for("static", filename=filename, v=version)

    return {"cv": load_cv(), "asset": asset, "now_year": time.localtime().tm_year}


# --------------------------------------------------------------------------
# Base de données des scores (SQLite, fichier local)
# --------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS scores (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   name TEXT NOT NULL,
                   score INTEGER NOT NULL,
                   level TEXT NOT NULL,
                   ip_hash TEXT NOT NULL,
                   created_at INTEGER NOT NULL
               )"""
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, created_at)")


def client_hash():
    forwarded = request.headers.get("X-Forwarded-For", "")
    ip = forwarded.split(",")[0].strip() or request.remote_addr or "?"
    return hashlib.sha256(f"{SCORE_SALT}:{ip}".encode()).hexdigest()


def top_scores(limit=10):
    rows = get_db().execute(
        "SELECT name, score, level FROM scores ORDER BY score DESC, created_at ASC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


# --------------------------------------------------------------------------
# Pages
# --------------------------------------------------------------------------
@app.get("/")
def index():
    photo = load_cv().get("photo") or "img/photo.jpg"
    has_photo = (BASE_DIR / "static" / photo).is_file()
    return render_template("index.html", has_photo=has_photo, photo_path=photo)


@app.get("/pong")
def pong():
    return render_template("pong.html")


@app.get("/wolf")
def wolf():
    return render_template("wolf.html")


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------
@app.get("/api/cv")
def api_cv():
    return jsonify(load_cv())


@app.get("/api/wolf/level")
def api_wolf_level():
    """Niveau du labyrinthe 3D. Les textures peuvent venir de static/img/walls/<1-5>.png ou d'une planche sheet.png."""
    with (BASE_DIR / "data" / "wolf_level.json").open(encoding="utf-8") as f:
        level = json.load(f)
    custom = {}
    for n in range(1, 6):
        rel = f"img/walls/{n}.png"
        if (BASE_DIR / "static" / rel).is_file():
            custom[str(n)] = url_for("static", filename=rel)
    level["custom_textures"] = custom
    sheet = level.get("sheet")
    if sheet:
        rel = sheet.get("file", "img/walls/sheet.png")
        if (BASE_DIR / "static" / rel).is_file():
            sheet["url"] = url_for("static", filename=rel)
        else:
            level.pop("sheet")
    return jsonify(level)


@app.get("/api/scores")
def api_scores():
    return jsonify(top_scores())


@app.post("/api/scores")
def api_post_score():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, "Corps JSON attendu.")

    name = str(data.get("name", "")).strip()
    level = data.get("level")
    score = data.get("score")

    if not NAME_RE.fullmatch(name):
        return jsonify(error="Pseudo invalide : 1 à 16 lettres, chiffres, espaces, points ou tirets."), 400
    if level not in LEVELS:
        return jsonify(error="Niveau inconnu."), 400
    if not isinstance(score, int) or isinstance(score, bool) or not 0 < score <= MAX_SCORE:
        return jsonify(error="Score invalide."), 400

    db = get_db()
    ip_hash = client_hash()
    now = int(time.time())
    last = db.execute(
        "SELECT MAX(created_at) AS t FROM scores WHERE ip_hash = ?", (ip_hash,)
    ).fetchone()["t"]
    if last and now - last < MIN_SECONDS_BETWEEN_SCORES:
        return jsonify(error="Trop de scores envoyés, réessayez dans quelques secondes."), 429

    db.execute(
        "INSERT INTO scores (name, score, level, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, score, level, ip_hash, now),
    )
    db.commit()
    return jsonify(ok=True, scores=top_scores()), 201


@app.get("/healthz")
def healthz():
    return jsonify(status="ok")


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify(error="Introuvable."), 404
    return render_template("404.html"), 404


@app.errorhandler(400)
def bad_request(e):
    return jsonify(error=getattr(e, "description", "Requête invalide.")), 400


init_db()

if __name__ == "__main__":
    app.run(debug=True)
