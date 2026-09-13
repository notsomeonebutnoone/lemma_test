'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, Bot, Check, Download, ExternalLink, Github, History, LayoutDashboard, LockKeyhole, Play, Radio, Settings2, ShieldCheck, Slack, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import type { Incident, Mode, Scenario } from '@/lib/commander/types';

type Status = { configured: boolean; liveEnabled: boolean; rollbackEnabled: boolean; missing: string[]; integrations: Record<string, string>; workerReady: boolean };
type Listing = Pick<Incident, 'id' | 'mode' | 'scenario' | 'title' | 'state' | 'createdAt' | 'finishedAt' | 'reportingErrors'>;
const MessageResponse = dynamic(() => import('@/components/ai-elements/message').then(module => module.MessageResponse), { loading: () => <span>Loading saved diagnosis…</span> });
const scenarios: { id: Scenario; label: string }[] = [
  { id: 'checkout-regression', label: 'Safe rollback' }, { id: 'unsafe-migration', label: 'Unsafe migration' },
  { id: 'false-success', label: 'False-success recovery' }, { id: 'report-outage', label: 'Reporting outage + retry' },
];
const icons = { Slack, GitHub: Github, Vercel: Activity, Linear: Activity, Sentinel: ShieldCheck };
const label = (text: string) => text.replaceAll('_', ' ').toLowerCase();
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed: ' + response.status);
  return data;
}
const post = (body?: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

export default function Home() {
  const [session, setSession] = useState<{ authenticated: boolean; configured: boolean } | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const [incidents, setIncidents] = useState<Listing[]>([]);
  const [run, setRun] = useState<Incident | null>(null);
  const [selected, setSelected] = useState('');
  const [mode, setMode] = useState<Mode>('sandbox');
  const [scenario, setScenario] = useState<Scenario>('checkout-regression');
  const [view, setView] = useState<'command' | 'history' | 'settings'>('command');
  const [busy, setBusy] = useState(false);
  const [liveConfirmed, setLiveConfirmed] = useState(false);
  const pendingKey = useRef<string | null>(null);
  const activeId = useRef('');
  useEffect(() => { request<{ authenticated: boolean; configured: boolean }>('/api/session').then(setSession).catch(e => setError(e.message)); const id = new URLSearchParams(window.location.search).get('incident') || ''; activeId.current = id; setSelected(id); }, []);
  const refresh = useCallback(async () => {
    const [list, config] = await Promise.all([request<{ incidents: Listing[] }>('/api/incidents'), request<Status>('/api/integrations/status')]);
    setIncidents(list.incidents); setStatus(config);
    const id = activeId.current;
    if (id) { const result = await request<{ run: Incident }>('/api/incidents/' + encodeURIComponent(id)); if (activeId.current === id) setRun(result.run); }
  }, []);
  useEffect(() => {
    if (!session?.authenticated) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    async function tick() { try { await refresh(); } catch (e) { if (!cancelled) setError((e as Error).message); } if (!cancelled) timer = setTimeout(tick, 1300); }
    void tick(); return () => { cancelled = true; clearTimeout(timer); };
  }, [session?.authenticated, refresh]);
  function selectRun(id: string) { activeId.current = id; setSelected(id); setRun(null); setView('command'); window.history.replaceState(null, '', '/?incident=' + id); void refresh().catch(e => setError(e.message)); }
  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await request('/api/session', post({ token })); setToken(''); setSession({ authenticated: true, configured: true }); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function start() {
    if (busy) return; setBusy(true); setError('');
    pendingKey.current ??= crypto.randomUUID();
    try { const data = await request<{ run: Incident }>('/api/incidents/run', post({ mode, scenario, eventKey: pendingKey.current })); pendingKey.current = null; selectRun(data.run.id); setRun(data.run); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function acknowledge() { if (!run) return; setBusy(true); try { const result = await request<{ run: Incident }>('/api/incidents/' + run.id, post()); setRun(result.run); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function download() {
    if (!run) return;
    try { const data = await request('/api/incidents/' + run.id); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'sentinel-' + run.mode + '-' + run.id + '.json'; a.click(); URL.revokeObjectURL(url); }
    catch (e) { setError((e as Error).message); }
  }
  async function logout() { try { await request('/api/session', { method: 'DELETE' }); setSession({ authenticated: false, configured: true }); setRun(null); setIncidents([]); } catch (e) { setError((e as Error).message); } }

  if (!session?.authenticated) return <main className="login-shell">
    <Card className="login-card"><CardContent>
      <div className="brand"><div className="brand-mark"><Radio size={19} /></div><span>sentinel</span></div>
      <span className="eyebrow">INCIDENT COMMANDER / OPERATOR ACCESS</span>
      <h1>A clear record.<br />A safer recovery.</h1>
      <p>Investigate a checkout failure across Slack, Vercel, GitHub, and Linear. Every action is gated, saved, and verified.</p>
      {session && !session.configured ? <div className="notice">Run <code>npm run setup</code>, restart Sentinel, then copy SENTINEL_OPERATOR_TOKEN from your local .env.local file. Keep it private.</div> : null}
      <form onSubmit={unlock}><label htmlFor="operator-token">Operator token</label><Input id="operator-token" type="password" autoComplete="current-password" value={token} onChange={e => setToken(e.target.value)} placeholder="From your local .env.local file" required /><Button type="submit" className="run-button" disabled={busy || !session?.configured}><LockKeyhole size={15} />{busy ? 'Unlocking…' : 'Unlock command center'}</Button></form>
      {error && <p role="alert" className="error-banner">{error}</p>}
      <small>Local, single-operator demo. Sandbox uses fixtures. Live access is off until explicitly configured.</small>
    </CardContent></Card>
  </main>;

  const running = Boolean(run && !run.finishedAt);
  const baseline = run?.context.baseline;
  const after = run?.context.verification?.at(-1);
  const diagnosis = run?.context.diagnosis;
  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Radio size={18} /></div><span>sentinel</span></div>
      <nav className="primary-nav" aria-label="Primary navigation">
        {([{ id: 'command', icon: LayoutDashboard, text: 'Command center' }, { id: 'history', icon: History, text: 'Incident history' }, { id: 'settings', icon: Settings2, text: 'Integrations & setup' }] as const).map(item => <Button key={item.id} variant="ghost" className={'nav-item ' + (view === item.id ? 'active' : '')} onClick={() => setView(item.id)} aria-label={item.text}><item.icon size={16} /><span>{item.text}</span></Button>)}
      </nav>
      <div className="sidebar-bottom"><div className="environment"><ShieldCheck size={18} /><div><small>EXECUTION BOUNDARY</small><strong>Disposable project only</strong></div></div><Button variant="ghost" className="nav-item" onClick={logout} aria-label="Lock console"><LockKeyhole size={15} /><span>Lock console</span></Button></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="crumbs"><span>Workspace</span><ArrowRight size={12} /><strong>incident commander</strong></div><div className="sandbox-pill"><span />{status?.workerReady ? 'WORKER ONLINE' : 'WORKER OFFLINE'}</div></header>
      <div className="mobile-nav"><Button variant="ghost" onClick={() => setView('command')}>Command</Button><Button variant="ghost" onClick={() => setView('history')}>History</Button><Button variant="ghost" onClick={() => setView('settings')}>Setup</Button><Button variant="ghost" onClick={logout}>Lock</Button></div>
      <div className="page">
        {error && <div className="error-banner" role="alert">{error}<Button variant="ghost" size="icon" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></Button></div>}
        {status && !status.workerReady && <div className="notice">Worker offline. Start <code>npm run worker</code> in a second terminal. Saved incidents remain available.</div>}
        {view === 'settings' ? <section className="settings-panel">
          <span className="eyebrow">CONFIGURATION, NOT A CONNECTION TEST</span><h1>Integration readiness</h1><p>Keys never leave the server. Run <code>npm run preflight</code> to check read access before your live rehearsal.</p>
          <div className="settings-grid">{Object.entries(status?.integrations || {}).map(([app, value]) => <Card key={app}><CardContent><h2>{app}</h2><p>{value}</p></CardContent></Card>)}</div>
          <div className="notice">Live mode: {status?.liveEnabled ? 'enabled' : 'disabled'} · Rollback switch: {status?.rollbackEnabled ? 'enabled' : 'disabled'}. Update .env.local and restart both processes to change these.</div>
          {Boolean(status?.missing.length) && <><h2>Missing or invalid configuration</h2><ul>{status?.missing.map(key => <li key={key}><code>{key}</code></li>)}</ul></>}
          <h2>What happens in a run</h2><ol><li>Signed Slack mention or authenticated dashboard request is saved to SQLite.</li><li>The worker gathers deployment identities, Git diff, runtime logs and synthetic checkout probes.</li><li>The model produces a cited hypothesis. Seven deterministic gates decide whether rollback is permitted.</li><li>If permitted and enabled, one rollback request is sent. Three healthy windows and matching production routing are required.</li><li>GitHub and Linear follow-up issues are created, then Slack receives the outcome and links.</li></ol>
          <p>See <code>SETUP.md</code>, <code>DEMO.md</code>, and <code>RELIABILITY.md</code> in the project for setup, rehearsal, and safety limits.</p>
        </section> : view === 'history' ? <section>
          <span className="eyebrow">PERSISTENT SQLITE JOURNAL</span><h1>Incident history</h1><p className="subtle">Reloading or restarting the browser does not erase runs. Showing the latest 100.</p>
          {incidents.length ? <div className="history-list">{incidents.map(item => <Button variant="ghost" key={item.id} className="history-row" onClick={() => selectRun(item.id)}><span><strong>{item.title}</strong><small>{item.id.slice(0, 8)} · {new Date(item.createdAt).toLocaleString()}</small></span><span className={'mode-badge ' + item.mode}>{item.mode}</span><span>{label(item.state)}{item.reportingErrors.length ? ' · reporting gap' : ''}</span><ArrowRight size={16} /></Button>)}</div> : <div className="empty-run"><History size={35} /><h2>No incidents yet</h2><p>Start a sandbox run from the command center.</p></div>}
        </section> : <>
          <section className="incident-heading"><div className="incident-title-row"><span className={'severity ' + (run?.state === 'RESOLVED' ? 'severity-resolved' : '')}><Activity size={12} />{run ? label(run.state) : 'READY TO INVESTIGATE'}</span><span className={'mode-badge ' + (run?.mode || mode)}>{(run?.mode || mode) === 'sandbox' ? 'SANDBOX · FIXTURE DATA' : 'LIVE · EXTERNAL ACTIONS'}</span></div>
            <div className="heading-main"><div><h1>Checkout incident command</h1><p>{selected ? 'RUN ' + selected.slice(0, 8) + ' / ' + (run?.source || 'loading') : 'Detect. Diagnose. Recover. Prove it.'}</p></div>
              <div className="run-controls"><label className="select-label">Mode<select value={mode} onChange={e => { setMode(e.target.value as Mode); pendingKey.current = null; setLiveConfirmed(false); }} disabled={busy}><option value="sandbox">Sandbox</option><option value="live">Live project</option></select></label>{mode === 'sandbox' && <label className="select-label">Scenario<select value={scenario} onChange={e => { setScenario(e.target.value as Scenario); pendingKey.current = null; }} disabled={busy}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}<Button className="run-button" onClick={start} disabled={busy || !status?.workerReady || (mode === 'live' && (!status?.configured || !status.liveEnabled || !liveConfirmed))}><Play size={15} />{busy ? 'Queuing…' : 'Start ' + mode + ' run'}</Button></div></div>
          </section>
          {mode === 'live' && <div className="notice"><label><input type="checkbox" checked={liveConfirmed} onChange={e => setLiveConfirmed(e.target.checked)} /> I am starting my live rehearsal: this posts Slack messages and creates GitHub/Linear issues. {status?.rollbackEnabled ? 'Rollback is enabled for the configured disposable project.' : 'Rollback is disabled.'}</label>{!status?.configured && <p>Complete the missing setup fields before live execution.</p>}</div>}
          <div className="command-grid"><section className="main-column">
            <div className="metrics-strip"><Metric title="BASELINE FAILURES" value={baseline ? baseline.failures + '/' + baseline.samples : '—'} note="synthetic checks" /><Metric title="LATEST FAILURES" value={after ? after.failures + '/' + after.samples : '—'} note="synthetic checks" /><Metric title="LATEST P95" value={after ? after.latencyMs + ' ms' : '—'} note="five-request window" /><Metric title="VERIFICATION" value={run?.context.verified ? '3/3 passed' : running ? 'In progress' : 'Unverified'} note="routing + checkout" /></div>
            {!run ? <div className="empty-run"><div className="radar"><ShieldCheck size={26} /></div><span className="eyebrow">THE EVIDENCE COMES FIRST</span><h2>{selected ? 'Loading saved incident…' : 'Ready when things go wrong.'}</h2><p>Run a safe rollback, block an unsafe migration, expose a false recovery, or watch a failed report retry. Sandbox uses the same worker and policy with explicitly simulated app adapters.</p><div className="flow-preview">{['Slack', 'Vercel', 'GitHub', 'Verify', 'Linear'].map((app, i) => <div key={app}><span>{i + 1}</span><small>{app}</small></div>)}</div></div> : <div className="ledger">
              <div className="section-header"><div><span className="eyebrow">SAVED EVIDENCE / {run.mode.toUpperCase()}</span><h2>Execution journal</h2></div><Button variant="ghost" onClick={download}><Download size={14} />Export JSON</Button></div>
              <div className="timeline">{run.evidence.map(event => { const Icon = icons[event.app]; return <article className={'timeline-step status-' + event.status} key={event.id}><div className="timeline-line"><div className="app-node"><Icon size={15} /></div><span /></div><div className="step-card"><div className="step-top"><div><span className="phase">{event.status}</span><span className="app-name">{event.app}</span></div><time className="duration">{new Date(event.at).toLocaleTimeString()}{event.durationMs > 0 ? ' · ' + event.durationMs + ' ms' : ''}</time></div><h3>{event.title}</h3>{event.title === 'Diagnosis saved' ? <div className="diagnosis-text"><MessageResponse disallowedElements={['img']}>{event.detail}</MessageResponse></div> : <p>{event.detail}</p>}{event.data !== undefined && <details className="raw-evidence"><summary>Inspect saved evidence</summary><pre>{JSON.stringify(event.data, null, 2)}</pre></details>}</div></article>; })}
                {running && <div className="thinking-row" role="status"><div className="thinking-orb"><Bot size={17} /></div><div><strong>{label(run.state)}</strong><span>{status?.workerReady ? 'Waiting for the next persisted event…' : 'Worker offline; waiting for restart.'}</span></div></div>}
              </div></div>}
          </section><aside className="right-rail">
            <div className="agent-card"><div className="agent-head"><div className="agent-orb"><Bot size={18} /></div><div><span>INCIDENT COMMANDER</span><strong>{run?.mode === 'live' ? 'Evidence-guided AI' : 'Deterministic sandbox'}</strong></div></div><div className="agent-body"><div className="agent-stat"><span>Model</span><strong>{diagnosis?.model || 'Not called'}</strong></div><div className="agent-stat"><span>Confidence estimate</span><strong>{diagnosis ? Math.round(diagnosis.confidence * 100) + '% · uncalibrated' : '—'}</strong></div><div className="agent-stat"><span>Tokens in / out</span><strong>{diagnosis ? diagnosis.inputTokens + ' / ' + diagnosis.outputTokens : '—'}</strong></div><div className="agent-stat"><span>Model cost</span><strong>{diagnosis?.costUsd === null ? 'Unknown' : diagnosis ? '$' + diagnosis.costUsd : '—'}</strong></div></div></div>
            <section className="rail-section"><div className="rail-title"><span>DETERMINISTIC SAFETY GATES</span><ShieldCheck size={14} /></div>{run?.context.policy ? run.context.policy.gates.map(g => <details className={'gate ' + (g.passed ? 'gate-pass' : 'gate-block')} key={g.name}><summary>{g.passed ? <Check size={13} /> : <X size={13} />}<span>{g.name}</span><small>{g.passed ? 'PASS' : 'BLOCK'}</small></summary><p>{g.reason}</p></details>) : <p className="subtle">Gates appear after evidence and diagnosis are saved. Missing evidence blocks rollback.</p>}</section>
            <section className="rail-section"><div className="rail-title"><span>EXTERNAL RECEIPTS</span><ExternalLink size={14} /></div>{run?.artifacts.length ? run.artifacts.map(a => <div className="artifact" key={a.app + a.id}><strong>{a.app}</strong>{a.url?.startsWith('https://') && run.mode === 'live' ? <a href={a.url} target="_blank" rel="noreferrer">{a.id.slice(0, 24)} <ExternalLink size={11} /></a> : <span>{a.id.slice(0, 24)} · simulated</span>}</div>) : <p className="subtle">No external records created yet.</p>}</section>
            {run?.finishedAt && <section className={'outcome-card ' + (run.state !== 'RESOLVED' ? 'outcome-blocked' : '')}><div><ShieldCheck size={16} /><strong>{label(run.state)}</strong></div><p>{run.summary}</p>{run.reportingErrors.map(e => <p key={e} className="report-error">{e}</p>)}{['APPROVAL_REQUIRED', 'ESCALATED'].includes(run.state) && <Button variant="outline" size="sm" onClick={acknowledge} disabled={busy || Boolean(run.approval)}>{run.approval ? 'Review acknowledged' : 'Acknowledge review'}</Button>}<p>No unsafe-policy override is available.</p></section>}
          </aside></div>
        </>}
      </div>
    </div>
  </main>;
}
function Metric({ title, value, note }: { title: string; value: string; note: string }) { return <div className="metric"><span className="metric-label">{title}</span><div className="metric-value"><strong>{value}</strong></div><small>{note}</small></div>; }
