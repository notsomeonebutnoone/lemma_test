import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Incident, Mode, Scenario } from './types';

export class Store {
  db: DatabaseSync;
  constructor(path = process.env.SENTINEL_DB_PATH || resolve('data/sentinel.sqlite')) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,resource TEXT NOT NULL,body TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS actions(incident_id TEXT NOT NULL,action_key TEXT NOT NULL,status TEXT NOT NULL,result TEXT,PRIMARY KEY(incident_id,action_key));
      CREATE TABLE IF NOT EXISTS worker(id TEXT PRIMARY KEY,heartbeat INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS generations(id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries(event_key TEXT PRIMARY KEY,incident_id TEXT NOT NULL);`);
    // Add audit timestamps without deleting or recreating existing local incident data.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const columns = this.db.prepare('PRAGMA table_info(actions)').all() as { name: string }[];
      for (const name of ['started_at', 'updated_at']) if (!columns.some(c => c.name === name)) this.db.exec('ALTER TABLE actions ADD COLUMN ' + name + ' TEXT');
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
  enqueue(input: { eventKey: string; mode: Mode; scenario: Scenario; title: string; source?: 'slack' | 'dashboard'; channel?: string; threadTs?: string }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const delivered = this.db.prepare('SELECT incident_id FROM deliveries WHERE event_key=?').get(input.eventKey) as { incident_id: string } | undefined;
      if (delivered) { this.db.exec('COMMIT'); return this.get(delivered.incident_id)!; }
      const resource = input.mode === 'live' ? 'live-project' : input.eventKey;
      const active = this.db.prepare('SELECT body FROM incidents WHERE resource=? AND done=0').get(resource) as { body: string } | undefined;
      const now = new Date().toISOString();
      const run: Incident = active ? JSON.parse(active.body) : { id: randomUUID(), ...input, source: input.source || 'dashboard', state: 'RECEIVED', createdAt: now, updatedAt: now, summary: 'Queued for investigation', evidence: [], artifacts: [], context: {}, reportingErrors: [], attempts: 0 };
      if (!active) this.db.prepare('INSERT INTO incidents(id,event_key,resource,body) VALUES(?,?,?,?)').run(run.id, input.eventKey, resource, JSON.stringify(run));
      this.db.prepare('INSERT INTO deliveries(event_key,incident_id) VALUES(?,?)').run(input.eventKey, run.id);
      this.db.exec('COMMIT'); return run;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  get(id: string): Incident | undefined {
    const row = this.db.prepare('SELECT body FROM incidents WHERE id=?').get(id) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  list(): Incident[] { return (this.db.prepare('SELECT body FROM incidents ORDER BY rowid DESC LIMIT 100').all() as { body: string }[]).map(r => JSON.parse(r.body)); }
  claim(owner: string): Incident | undefined {
    const now = Date.now();
    const row = this.db.prepare(`UPDATE incidents SET lease=?,lease_until=? WHERE id=(SELECT id FROM incidents WHERE done=0 AND due<=? AND lease_until<? ORDER BY rowid LIMIT 1) RETURNING body`).get(owner, now + 120000, now, now) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  assertLease(id: string, owner: string) {
    if (!this.db.prepare('SELECT id FROM incidents WHERE id=? AND lease=? AND lease_until>?').get(id, owner, Date.now())) throw new Error('Worker lease lost; execution stopped');
  }
  heartbeat(id: string, owner: string) { this.assertLease(id, owner); this.db.prepare('UPDATE incidents SET lease_until=? WHERE id=? AND lease=?').run(Date.now() + 120000, id, owner); }
  ping(owner: string) { this.db.prepare('INSERT INTO worker VALUES(?,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat').run(owner, Date.now()); }
  workerReady() { const row = this.db.prepare('SELECT MAX(heartbeat) AS latest FROM worker').get() as { latest: number }; return Boolean(row.latest && Date.now() - row.latest < 15000); }
  save(run: Incident, owner: string) {
    this.assertLease(run.id, owner); run.updatedAt = new Date().toISOString();
    this.db.prepare('UPDATE incidents SET body=? WHERE id=? AND lease=?').run(JSON.stringify(run), run.id, owner);
  }
  release(run: Incident, owner: string, done: boolean, delayMs = 0) {
    this.save(run, owner);
    this.db.prepare('UPDATE incidents SET done=?,due=?,lease=NULL,lease_until=0 WHERE id=? AND lease=?').run(done ? 1 : 0, Date.now() + delayMs, run.id, owner);
  }
  action(id: string, key: string): { status: string; result: unknown } | undefined {
    const row = this.db.prepare('SELECT status,result FROM actions WHERE incident_id=? AND action_key=?').get(id, key) as { status: string; result: string | null } | undefined;
    return row && { status: row.status, result: row.result ? JSON.parse(row.result) : null };
  }
  setAction(id: string, key: string, status: string, result?: unknown) {
    const now = new Date().toISOString();
    this.db.prepare('INSERT INTO actions(incident_id,action_key,status,result,started_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(incident_id,action_key) DO UPDATE SET status=excluded.status,result=excluded.result,updated_at=excluded.updated_at').run(id, key, status, result === undefined ? null : JSON.stringify(result), now, now);
  }
  actions(id: string) { return (this.db.prepare('SELECT action_key,status,result,started_at,updated_at FROM actions WHERE incident_id=? ORDER BY rowid').all(id) as { action_key: string; status: string; result: string | null; started_at: string | null; updated_at: string | null }[]).map(row => ({ actionKey: id + ':' + row.action_key, status: row.status, startedAt: row.started_at, updatedAt: row.updated_at, result: row.result ? JSON.parse(row.result) : null })); }
  generation(id: string, incidentId: string, body: unknown) { this.db.prepare('INSERT INTO generations VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(id, incidentId, JSON.stringify(body)); }
  generations(id: string) { return (this.db.prepare('SELECT body FROM generations WHERE incident_id=?').all(id) as { body: string }[]).map(r => JSON.parse(r.body)); }
  acknowledge(id: string, actor: string) {
    const row = this.db.prepare('SELECT body FROM incidents WHERE id=? AND done=1').get(id) as { body: string } | undefined;
    if (!row) throw new Error('Incident is still running or does not exist');
    const run: Incident = JSON.parse(row.body);
    if (run.approval) return run;
    if (run.state !== 'APPROVAL_REQUIRED' && run.state !== 'ESCALATED') throw new Error('Incident does not require review');
    run.approval = { actor, decision: 'acknowledge', at: new Date().toISOString() };
    run.summary += ' Operator acknowledged; a forward fix is required. No rollback override granted.';
    this.db.prepare('UPDATE incidents SET body=? WHERE id=? AND done=1').run(JSON.stringify(run), id); return run;
  }
}

let instance: Store | undefined;
export function getStore() { return instance ??= new Store(); }
