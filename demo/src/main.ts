import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  // Solo este equipo por omisión; HOST=0.0.0.0 para abrirlo desde un teléfono en la misma red.
  const host = process.env.HOST ?? '127.0.0.1';
  const databasePath = process.env.DEMO_DB ?? join(__dirname, '..', 'data', 'demo.sqlite');
  const app = await createApp({ databasePath });
  await app.listen(port, host);
  const logger = new Logger('Demo');
  logger.log(
    `Demo de trazabilidad (datos ficticios) en http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
  );
  if (host === '0.0.0.0')
    logger.warn('Abierto a la red local: úsalo solo en una red de confianza (sin PIN, P-40).');
}

void main();
