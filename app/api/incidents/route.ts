import { api, protect } from '@/lib/commander/auth';
import { getStore } from '@/lib/commander/store';
export const runtime = 'nodejs';
export function GET(request: Request) { return api(() => { protect(request); return Response.json({ incidents: getStore().list().map(r => ({ id: r.id, mode: r.mode, scenario: r.scenario, title: r.title, state: r.state, createdAt: r.createdAt, finishedAt: r.finishedAt, reportingErrors: r.reportingErrors })) }); }); }
