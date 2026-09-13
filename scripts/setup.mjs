import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
if (existsSync('.env.local')) {
  console.log('.env.local already exists and was left untouched. Compare it with .env.example; restart web and worker after edits.');
} else {
  const template = readFileSync('.env.example', 'utf8').replace(/^SENTINEL_OPERATOR_TOKEN=$/m, 'SENTINEL_OPERATOR_TOKEN=' + randomBytes(32).toString('hex')).replace(/^TARGET_PROBE_TOKEN=$/m, 'TARGET_PROBE_TOKEN=' + randomBytes(32).toString('hex'));
  writeFileSync('.env.local', template, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .env.local with random operator/probe tokens. Open it in your editor. No keys were printed; no external services were contacted.');
}
