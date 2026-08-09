# API Voyage — Heure & Dépenses ✈️

Petite API Express pour un voyage : **heure de Casablanca + France** en direct et **enregistreur de dépenses** (devise au choix, catégories, modification protégée par code). L'accès est protégé par un **login / mot de passe**, et les dépenses peuvent être **exportées en CSV**.

## Démarrage

```bash
npm install
npm start        # ou : npm run dev
```

Serveur sur `http://localhost:3000` (variable `PORT` pour changer). Les dépenses sont stockées dans `data/expenses.json` (auto-créé, ignoré par git).

## Authentification 🔒

L'application entière (page + API dépenses) est protégée : sans session, `GET /` affiche la page de connexion et les routes `/api/expenses*` renvoient `401`.

Identifiants par défaut : **`admin` / `voyage2026`** — à changer via variables d'environnement :

| Variable    | Défaut      | Description                       |
| ----------- | ----------- | --------------------------------- |
| `AUTH_USER` | `admin`     | Nom d'utilisateur                 |
| `AUTH_PASS` | `voyage2026`| Mot de passe                      |

La session (cookie `HttpOnly`, `SameSite=Lax`) dure **7 jours**. Les sessions sont stockées en mémoire (perdues au redémarrage — il faudra se reconnecter).

## Page principale

`GET /` — fond **vert pâle**, heure de Casablanca + heure de France, et le gestionnaire de dépenses. Boutons **⬇️ Exporter CSV** (télécharge toutes les dépenses) et **Déconnexion**. Au moment d'**ajouter une dépense**, le fond affiche l'image `dollar.avif` (dans le dossier, servie par l'API).

## Endpoints

| Méthode | Route                        | Description                                       |
| ------- | ---------------------------- | ------------------------------------------------- |
| `GET`   | `/`                          | Page principale (ou page de connexion si non connecté) |
| `GET`   | `/dollar.avif`               | Image de fond (dollar)                            |
| `POST`  | `/api/login`                 | Connexion (`{ username, password }`) → cookie session |
| `POST`  | `/api/logout`                | Déconnexion (supprime la session)                 |
| `GET`   | `/api/auth/status`           | État de la session (`{ authenticated, username }`)| 
| `GET`   | `/api/time`                  | Heures Casablanca + France (JSON)                 |
| `GET`   | `/api/expenses`              | Lister les dépenses (tri par date décroissante)   |
| `POST`  | `/api/expenses`              | Créer une dépense                                 |
| `PUT`   | `/api/expenses/:id`          | Modifier le **nom** (code `1111` requis)          |
| `GET`   | `/api/expenses/export.csv`   | **Toutes** les dépenses en CSV (téléchargement)   |
| `GET`   | `/health`                    | Healthcheck                                       |

> Routes `⚠️ /api/expenses*` : authentification requise (sinon `401`).

### Exemple — se connecter

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"username":"admin","password":"voyage2026"}'
```

## Export CSV ⬇️

Le bouton **Exporter CSV** de la page (ou `GET /api/expenses/export.csv`) télécharge `depenses.csv` avec **toutes** les dépenses enregistrées.

- Séparateur `;` et **BOM UTF-8** → s'ouvre directement dans Excel (accents corrects).
- Colonnes : `id; name; amount; currency; date; category; createdAt; updatedAt`.
- Les champs contenant `;`, `"` ou un retour à la ligne sont entre guillemets (échappés `""`).

### Exemple — créer une dépense

```bash
curl -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"name":"Resto","amount":45.5,"currency":"MAD","date":"2026-08-09","category":"Alimentation"}'
```

### Exemple — modifier le nom (code 1111)

```bash
curl -X PUT http://localhost:3000/api/expenses/<id> \
  -H "Content-Type: application/json" \
  -d '{"code":"1111","name":"Resto Jemaa el-Fna"}'
```

Tout autre code → `403 Code incorrect`.

## Champs d'une dépense

| Champ      | Type   | Requis | Défaut | Description                          |
| ---------- | ------ | ------ | ------ | ------------------------------------ |
| `name`     | string | ✅     | –      | Nom de la dépense                    |
| `amount`   | number | ✅     | –      | Montant > 0 (2 décimales max)        |
| `currency` | string | ❌     | `EUR`  | `EUR`, `MAD`, `USD`, `GBP`           |
| `date`     | string | ❌     | Aujourd'hui | Date `YYYY-MM-DD`              |
| `category` | string | ✅     | –      | Catégorie (Alimentation, Transport…) |

## Déploiement sur Vercel

L'API utilise **Express** (`server.js`) — Vercel le détecte automatiquement :

```bash
npm i -g vercel
vercel
```

> ⚠️ Sur Vercel (serverless), le système de fichiers est en lecture seule sauf `/tmp` : les dépenses y sont donc **éphémères**. Pour de la persistance, il faudra brancher une base (Neon/Postgres…).

## Tests

```bash
npm test
```

## Licence

MIT
