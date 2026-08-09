# API Dépenses

API REST simple pour enregistrer et suivre des **dépenses mensuelles**.
Node.js + Express, données stockées dans un fichier JSON local (`data/expenses.json`, auto-créé).

## Démarrage rapide

```bash
npm install
npm start          # ou npm run dev (rechargement auto)
```

Le serveur écoute sur `http://localhost:3000` (modifiable avec la variable `PORT`).

## Endpoints

| Méthode | Route                          | Description                                  |
| ------- | ------------------------------ | -------------------------------------------- |
| `POST`  | `/api/expenses`                | Créer une dépense                            |
| `GET`   | `/api/expenses`                | Lister (tri par date décroissante)           |
| `GET`   | `/api/expenses?month=YYYY-MM`  | Lister les dépenses d'un mois                |
| `GET`   | `/api/expenses?category=X`     | Filtrer par catégorie                        |
| `GET`   | `/api/expenses/:id`            | Détail d'une dépense                         |
| `PUT`   | `/api/expenses/:id`            | Mettre à jour (partiel)                      |
| `DELETE`| `/api/expenses/:id`            | Supprimer                                    |
| `GET`   | `/api/summary?month=YYYY-MM`   | Total + total par catégorie du mois          |
| `GET`   | `/api/time`                    | Date et heure courantes                       |
| `GET`   | `/health`                      | Healthcheck                                  |

### Exemple — heure courante

```bash
curl http://localhost:3000/api/time
```

```json
{
  "date": "2026-08-09",
  "time": "14:32:05",
  "iso": "2026-08-09T14:32:05.123Z",
  "timezone": "Europe/Paris"
}
```

### Exemple — créer une dépense

```bash
curl -X POST http://localhost:3000/api/expenses \
  -H "Content-Type: application/json" \
  -d '{"label":"Courses","amount":42.50,"category":"Alimentation","date":"2026-08-03"}'
```

Réponse (`201 Created`) :

```json
{
  "id": "8f3c…",
  "label": "Courses",
  "amount": 42.5,
  "category": "Alimentation",
  "date": "2026-08-03",
  "createdAt": "2026-08-09T…Z"
}
```

### Exemple — résumé d'un mois

```bash
curl "http://localhost:3000/api/summary?month=2026-08"
```

```json
{
  "month": "2026-08",
  "count": 12,
  "total": 654.3,
  "byCategory": { "Alimentation": 214.8, "Logement": 320, "Transport": 119.5 }
}
```

## Champs d'une dépense

| Champ      | Type     | Requis | Défaut  | Description                        |
| ---------- | -------- | ------ | ------- | ---------------------------------- |
| `label`    | string   | ✅     | –       | Libellé (ex. « Courses »)          |
| `amount`   | number   | ✅     | –       | Montant > 0 (2 décimales max)      |
| `category` | string   | ❌     | `Autre` | Catégorie libre                    |
| `date`     | string   | ❌     | Aujourd'hui | Date au format `YYYY-MM-DD`    |

## Tests

```bash
npm test
```

## Déploiement sur Vercel

Le projet est prêt pour Vercel : `api/index.js` exporte l'app Express et `vercel.json` redirige toutes les requêtes vers cette fonction serverless.

```bash
npm i -g vercel
vercel
```

Ou connectez simplement le dépôt GitHub dans le dashboard Vercel.

### ⚠️ Stockage

Les fonctions serverless de Vercel ont un système de fichiers **en lecture seule** (sauf `/tmp`, éphémère) : un simple fichier JSON ne suffit donc pas.

- **Sans configuration** : les données sont stockées dans `/tmp` → l'API fonctionne mais les données sont **perdues** à chaque redémarrage à froid / redéploiement.
- **Recommandé — Vercel KV (Redis, persistant)** :
  1. Dans le dashboard Vercel → **Storage** → créez un store **KV** (offre gratuite).
  2. Copiez les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` dans **Project → Settings → Environment Variables** (environnement Production).
  3. Redéployez. L'API bascule automatiquement sur le KV et les données persistent.

L'endpoint `GET /health` renvoie le backend de stockage actif (`vercel-kv (persistant)` ou `/tmp (éphémère sur Vercel)`), utile pour vérifier le déploiement.

> **Autres plateformes** (Railway, Fly.io, VPS) : le stockage fichier local (`data/`) fonctionne, mais reste éphémère sur redéploiement. Le dossier `data/` est ignoré par git.

## Licence

MIT
