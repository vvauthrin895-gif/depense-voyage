# API Heure Casablanca 🕒

API minimaliste qui affiche l'**heure à Casablanca** sur une page verte, sans aucune dépendance (Node.js pur).

## Démarrage

```bash
npm start        # ou : node server.js
```

Serveur sur `http://localhost:3000` (variable `PORT` pour changer).

## Endpoints

| Méthode | Route        | Description                                |
| ------- | ------------ | ------------------------------------------ |
| `GET`   | `/`          | Page verte avec l'heure en temps réel      |
| `GET`   | `/api/time`  | Heure de Casablanca en JSON                |
| `GET`   | `/health`    | Healthcheck + heure                        |

### Exemple — `/api/time`

```json
{
  "time": "17:42:31",
  "date": "samedi 9 août 2026",
  "iso": "2026-08-09T16:42:31.123Z",
  "timezone": "Africa/Casablanca"
}
```

## Tests

```bash
npm test
```

## Licence

MIT
