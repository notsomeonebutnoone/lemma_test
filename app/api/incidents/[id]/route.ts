import { api, HttpError, protect } from '@/lib/commander/auth';
import { getStore } from '@/lib/commander/store';
export const runtime = 'nodejs';
export function GET(request: Request, context: { params: Promise<{ id: string }> }) { return api(async () => {
  protect(request); const { id } = await context.params; const store = getStore(); const run = store.get(id);
  if (!run) throw new HttpError(404, 'Incident not found');
  return Response.json({ run, generations: store.generations(id), actions: store.actions(id) });
}); }
export function POST(request: Request, context: { params: Promise<{ id: string }> }) { return api(async () => {
  protect(request, true); const { id } = await context.params;
  try { return Response.json({ run: getStore().acknowledge(id, 'local-operator') }); }
  catch (e) { throw new HttpError(409, (e as Error).message); }
}); }
