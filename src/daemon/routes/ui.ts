import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(__dirname, '..', '..', '..', 'ui');

export default async function uiPlugin(app: FastifyInstance): Promise<void> {
  const htmlPath = path.join(UI_DIR, 'index.html');
  const cachedHtml = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf-8') : null;

  app.get('/ui', async (_request, reply) => {
    if (!cachedHtml) {
      return reply.status(404).send({ error: 'Web UI not found' });
    }
    return reply.type('text/html').send(cachedHtml);
  });
}
