import 'dotenv/config';
import { buildApp } from './app.js';

const app = buildApp();
const port = Number(process.env.PORT) || 3334;

async function start() {
  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server listening at http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
