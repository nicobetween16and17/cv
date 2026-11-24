# Contenu à coller dans le fichier WSGI de l'onglet "Web" de PythonAnywhere
# (en remplaçant tout le contenu existant). Adaptez VOTRE_NOM et le dossier.
import os
import sys

PROJECT_DIR = "/home/VOTRE_NOM/cv-site"
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

# Texte secret servant à anonymiser les adresses IP dans le classement.
os.environ["SCORE_SALT"] = "remplacez-par-une-longue-phrase-au-hasard"

from app import app as application  # noqa: E402
