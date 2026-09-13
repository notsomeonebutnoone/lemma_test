import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import health from '../demo-target/api/health.mjs';
import checkout from '../demo-target/api/checkout.mjs';
if (!process.env.TARGET_PROBE_TOKEN) throw new Error('Run npm run setup first');
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/api/health') return health(req, res);
  if (path === '/api/checkout') return void checkout(req, res).catch(() => { res.statusCode = 500; res.end('Demo handler failed'); });
  if (path === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(readFileSync('demo-target/index.html')); }
  res.statusCode = 404; res.end('Not found');
});
server.listen(3100, '127.0.0.1', () => console.log('Disposable checkout at http://127.0.0.1:3100. Restart after switching variants.'));
