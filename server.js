import { createApp } from './src/app.js';

const port = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(port, () => {
  console.log(`API de dépenses démarrée sur http://localhost:${port}`);
});
