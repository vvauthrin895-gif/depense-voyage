import { handleRequest } from '../src/handler.js';

// Fonction serverless Vercel : Vercel appelle ce handler (req, res)
// pour chaque requête (vercel.json redirige toutes les routes vers /api).
export default handleRequest;
