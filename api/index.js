import { createApp } from '../src/app.js';

// Point d'entrée Vercel : l'app Express est exportée telle quelle.
// vercel.json redirige toutes les requêtes vers cette fonction (/api).
export default createApp();
