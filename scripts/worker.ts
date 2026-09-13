import { randomUUID } from 'node:crypto';
import { Store } from '../lib/commander/store';
import { executeIncident } from '../lib/commander/engine';
import { sandboxPorts } from '../lib/commander/sandbox';
import { livePorts } from '../lib/commander/live';
import { liveConfig } from '../lib/commander/config';
import { sleep } from '../lib/commander/http';
const store = new Store(); const owner = randomUUID(); let stopping = false;
process.on('SIGINT', () => { stopping = true; }); process.on('SIGTERM', () => { stopping = true; });
console.log('Sentinel worker started. Persistent SQLite queue; live actions require explicit environment switches.');
async function main() {
  while (!stopping) {
    store.ping(owner); const run = store.claim(owner);
    if (!run) { await sleep(500); continue; }
    const heartbeat = setInterval(() => { try { store.ping(owner); store.heartbeat(run.id, owner); } catch { stopping = true; } }, 4000);
    try {
      const ports = run.mode === 'sandbox' ? sandboxPorts(run, store) : livePorts(run, store, liveConfig());
      await executeIncident(store, run, ports, owner);
      console.log(run.id + ' · ' + (store.get(run.id)?.state || 'unknown'));
    } catch {
      try { store.assertLease(run.id, owner); run.state = 'ESCALATED'; run.outcome = 'ESCALATED'; run.finishedAt = new Date().toISOString(); run.summary = 'Worker stopped safely. Configuration invalid or lease lost. Inspect action receipts before any new live run.'; store.release(run, owner, true); } catch { /* Another worker owns recovery. */ }
      console.error(run.id + ' · stopped; operator review required');
    } finally { clearInterval(heartbeat); }
  }
  store.close();
}
main().catch(() => { console.error('Worker could not access its queue'); process.exitCode = 1; });
