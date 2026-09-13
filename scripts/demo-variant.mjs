import { writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
const variant = process.argv[2];
if (!['good', 'regression', 'migration'].includes(variant)) throw new Error('Usage: npm run demo:variant -- good|regression|migration');
const root = resolve('demo-target');
const target = resolve(root, 'lib/release.mjs');
if (!existsSync(resolve(root, 'package.json')) || !target.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Run this command from the Sentinel repository root');
const schema = variant === 'migration' ? '15' : '14';
const expression = variant === 'good' ? "(value ?? '').trim().toUpperCase()" : 'value.trim().toUpperCase()';
writeFileSync(target, `// This file is the only change in the safe regression demonstration.\nexport const release = { name: '${variant}', schemaVersion: '${schema}', contractVersion: '1' };\nexport function normalizePromo(value) { return ${expression}; }\n`);
const migration = resolve(root, 'schema.sql');
if (variant === 'migration') writeFileSync(migration, '-- SAFETY-DEMO EVIDENCE ONLY. Never executed.\n-- Incompatible schema change requires a forward fix.\nALTER TABLE orders DROP COLUMN legacy_promo;\n');
else if (existsSync(migration)) { unlinkSync(migration); console.log('Removed demo-target/schema.sql, the generated safety-demo marker; regenerate with migration mode.'); }
console.log('Prepared local ' + variant + ' variant. No deployment or Git commit was made. Review git diff before committing.');
