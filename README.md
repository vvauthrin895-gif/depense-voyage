# API Voyage — Heure & Dépenses ✈️

Petite API Express pour un voyage : **heure de Casablanca + France** en direct et **enregistreur de dépenses** (devise au choix, catégories, modification protégée par code). L'accès est protégé par un **login / mot de passe**, avec **gestion des utilisateurs** (page admin) et **export CSV**. Chaque utilisateur a **sa propre liste de dépenses** (aucune dépense en commun).

## Démarrage

```bash
npm install
npm start        # ou : npm run dev
```

Serveur sur `http://localhost:3000` (variable `PORT` pour changer). Les dépenses sont stockées dans `data/expenses.json` (auto-créé, ignoré par git).

## Authentification 🔒

L'application entière (page + API dépenses) est protégée : sans session, `GET /` affiche la page de connexion et les routes `/api/expenses*` renvoient `401`.

### Comptes

| Compte                    | Rôle        | Description                                       |
| ------------------------- | ----------- | ------------------------------------------------- |
| **`Victor` / `2580`**     | `admin`     | Créé automatiquement au démarrage. **Seul un admin peut gérer les utilisateurs** (page `👥 Utilisateurs`). |
| `AUTH_USER` / `AUTH_PASS` | `user`      | Compte de repli (si les variables d'env sont définies, il est importé au 1er démarrage) |
| `admin` / `voyage2026`    | `user`      | Défauts de `AUTH_USER` / `AUTH_PASS` si non définis |

| Variable    | Défaut      | Description                       |
| ----------- | ----------- | --------------------------------- |
| `AUTH_USER` | `admin`     | Nom d'utilisateur (compte de repli)|
| `AUTH_PASS` | `voyage2026`| Mot de passe du compte de repli    |

### Gestion des utilisateurs 👥

L'administrateur (Victor) voit le bouton **👥 Utilisateurs** sur la page principale → `GET /admin`. Il peut :

- **Ajouter** un utilisateur (nom, mot de passe ≥ 4 caractères, rôle `user` ou `admin`) ;
- **Changer le mot de passe** ou **promouvoir / rétrograder** un utilisateur ;
- **Supprimer** un compte.

Les utilisateurs sont stockés dans `data/users.json` (mots de passe **hachés** SHA-256 + sel, fichier ignoré par git). Garde-fous : impossible de supprimer son propre compte ni de retirer le rôle admin du **dernier** administrateur.

### Dépenses par utilisateur 💰

Chaque dépense est liée à son créateur (`owner`) : un utilisateur ne voit, ne modifie et n'exporte en CSV **que ses propres dépenses** — les listes ne sont jamais partagées. Les dépenses créées avant cette séparation sont automatiquement attribuées à l'administrateur (Victor) au premier chargement.

### Anti force-brute 🔐

Après **5 échecs** de connexion consécutifs (par adresse IP + nom d'utilisateur), la connexion est **verrouillée 15 minutes** : les tentatives suivantes reçoivent un `429 Too Many Requests` avec l'en-tête `Retry-After`. Une connexion réussie réinitialise le compteur.

La session (cookie `HttpOnly`, `SameSite=Lax`) dure **7 jours**. Les sessions sont stockées en mémoire (perdues au redémarrage — il faudra se reconnecter).

## Page principale

`GET /` — fond **vert pâle**, heure de Casablanca + heure de France, et le gestionnaire de dépenses. Boutons **⬇️ Exporter CSV** (télécharge toutes les dépenses) et **Déconnexion**. Au moment d'**ajouter une dépense**, le fond affiche l'image `dollar.avif` (dans le dossier, servie par l'API).

## Endpoints

| Méthode | Route                        | Description                                       |
| ------- | ---------------------------- | ------------------------------------------------- |
| `GET`   | `/`                          | Page principale (ou page de connexion si non connecté) |
| `GET`   | `/admin`                     | Page de gestion des utilisateurs (admin uniquement) |
| `GET`   | `/dollar.avif`               | Image de fond (dollar)                            |
| `POST`  | `/api/login`                 | Connexion (`{ username, password }`) → cookie session |
| `POST`  | `/api/logout`                | Déconnexion (supprime la session)                 |
| `GET`   | `/api/auth/status`           | État de la session (`{ authenticated, username, role }`) |
| `GET`   | `/api/users`                 | Lister les utilisateurs (admin)                   |
| `POST`  | `/api/users`                 | Créer un utilisateur (admin)                      |
| `PUT`   | `/api/users/:username`       | Changer mot de passe / rôle (admin)               |
| `DELETE`| `/api/users/:username`       | Supprimer un utilisateur (admin)                  |
| `GET`   | `/api/time`                  | Heures Casablanca + France (JSON)                 |
| `GET`   | `/api/expenses`              | Lister **mes** dépenses (tri par date décroissante) |
| `POST`  | `/api/expenses`              | Créer une dépense                                 |
| `PUT`   | `/api/expenses/:id`          | Modifier le **nom** (code `1111` requis)          |
| `GET`   | `/api/expenses/export.csv`   | **Mes** dépenses en CSV (téléchargement)          |
| `GET`   | `/health`                    | Healthcheck                                       |

> Routes `⚠️ /api/expenses*` et `⚠️ /api/users*` : authentification requise ; `/api/users*` et `/admin` sont réservés à l'**administrateur** (sinon `401`/`403`).

### Exemple — se connecter

```bash
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"username":"admin","password":"voyage2026"}'
```

## Export CSV ⬇️

Le bouton **Exporter CSV** de la page (ou `GET /api/expenses/export.csv`) télécharge `depenses.csv` avec **toutes les dépenses de l'utilisateur connecté**.

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
