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
| `GET`   | `/health`                      | Healthcheck                                  |

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

## Déploiement

- **Vercel / plateformes serverless** : le stockage fichier local est éphémère. Pour un vrai déploiement, brancher une base (Postgres/SQLite managé) ou utiliser un serveur classique (Railway, Fly.io, VPS).
- Le dossier `data/` est ignoré par git : chaque instance repart d'un fichier vide.

## Licence

MIT
