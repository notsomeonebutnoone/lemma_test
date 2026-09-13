import { z } from 'zod';
import { api, bodyJson, HttpError, protect } from '@/lib/commander/auth';
import { getStore } from '@/lib/commander/store';
import { liveConfig } from '@/lib/commander/config';
export const runtime = 'nodejs';
const schema = z.object({ mode: z.enum(['sandbox', 'live']), scenario: z.enum(['checkout-regression', 'unsafe-migration', 'false-success', 'report-outage']), eventKey: z.uuid() }).strict();
export function POST(request: Request) { return api(async () => {
  protect(request, true);
  const parsed = schema.safeParse(await bodyJson(request)); if (!parsed.success) throw new HttpError(400, 'Valid mode, scenario and UUID eventKey are required');
  const body = parsed.data;
  if (body.mode === 'live') { try { liveConfig(); } catch (e) { throw new HttpError(409, (e as Error).message); } }
  const store = getStore();
  if (!store.workerReady()) throw new HttpError(503, 'Worker offline. Start npm run worker, then retry.');
  if (store.list().filter(r => !r.finishedAt).length > 15) throw new HttpError(429, 'Incident queue is full');
  const run = store.enqueue({ ...body, eventKey: 'dashboard:' + body.eventKey, title: body.mode === 'live' ? 'Checkout failures on the configured demo project' : 'Sandbox · ' + body.scenario });
  return Response.json({ run }, { status: 202 });
}); }
