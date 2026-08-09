import http from 'node:http';
import { handleRequest } from './src/handler.js';

const PORT = Number(process.env.PORT) || 3000;

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`API Heure Casablanca démarrée sur http://localhost:${PORT}`);
});
