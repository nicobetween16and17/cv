# CV étudiant : Flask + Pong

Site de CV en Python (Flask) avec un jeu Pong et un classement des scores.

## Structure

```
cv-site/
├── app.py                     serveur Flask (pages, API, base SQLite)
├── requirements.txt           dépendances (Flask)
├── wsgi_pythonanywhere.py     modèle du fichier WSGI pour PythonAnywhere
├── data/
│   ├── cv.json                tout le contenu du CV : c'est le fichier à modifier
│   └── pong.sqlite3           créé automatiquement (classement)
├── templates/                 pages HTML (Jinja)
└── static/
    ├── css/style.css
    └── js/site.js, pong.js
```

## Personnaliser le CV

1. Ouvrez `data/cv.json` et remplacez les exemples par vos informations (nom, école, projets, compétences, contact).
2. Passez `"sample": true` à `"sample": false` pour retirer le bandeau « Contenu d'exemple ».
3. Les niveaux de compétences vont de 1 à 5. Les catégories et les filtres se créent tout seuls.

## Lancer en local

```bash
python -m venv venv
source venv/bin/activate        # Windows : venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Puis ouvrez http://127.0.0.1:5000.

## Déployer sur PythonAnywhere

1. Créez un compte gratuit sur pythonanywhere.com. Votre site sera à `https://VOTRE_NOM.pythonanywhere.com`.
2. Envoyez le projet : onglet **Files**, dossier personnel, bouton **Upload a file** pour le fichier `cv-site.zip`.
3. Ouvrez une console **Bash** (onglet **Consoles**) et tapez :
   ```bash
   unzip cv-site.zip
   cd cv-site
   ```
4. Onglet **Web** : **Add a new web app**, choisissez **Manual configuration** (pas « Flask »), puis la version de Python la plus récente proposée.
5. Sur la page de la web app :
   - **Source code** et **Working directory** : `/home/VOTRE_NOM/cv-site`
   - **Virtualenv** (recommandé) : dans la console Bash, `mkvirtualenv --python=python3.12 cvenv` (adaptez la version), puis `pip install -r ~/cv-site/requirements.txt`, et saisissez `/home/VOTRE_NOM/.virtualenvs/cvenv`.
   - **Static files** (facultatif, plus rapide) : URL `/static/`, dossier `/home/VOTRE_NOM/cv-site/static`.
6. Cliquez sur le lien du **fichier WSGI** (`/var/www/VOTRE_NOM_pythonanywhere_com_wsgi.py`), supprimez son contenu et collez celui de `wsgi_pythonanywhere.py` en remplaçant `VOTRE_NOM` et le texte secret `SCORE_SALT`.
7. Cliquez sur le gros bouton vert **Reload**. Le site est en ligne.

### Mettre à jour plus tard

- Modifiez `data/cv.json` (ou les autres fichiers) via l'onglet **Files** ou un `git pull` en console.
- Cliquez sur **Reload** dans l'onglet **Web**.
- En cas d'erreur, consultez l'**Error log** en bas de l'onglet **Web**.

### Notes

- Le compte gratuit expire s'il n'est pas prolongé : un bouton de prolongation est sur l'onglet **Web** (à cliquer tous les trois mois).
- Le classement est stocké dans `data/pong.sqlite3`. Faites une copie de ce fichier pour le sauvegarder.
- Le classement est ludique : le score est calculé par le navigateur et n'est pas vérifié strictement. Le serveur limite les valeurs et le rythme d'envoi.

## API

| Méthode | Adresse | Rôle |
| --- | --- | --- |
| GET | `/api/cv` | contenu du CV en JSON |
| GET | `/api/scores` | 10 meilleurs scores |
| POST | `/api/scores` | enregistre un score `{name, score, level}` |
| GET | `/healthz` | test de santé |
