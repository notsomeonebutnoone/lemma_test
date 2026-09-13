import { api, protect } from '@/lib/commander/auth';
import { configStatus } from '@/lib/commander/config';
import { getStore } from '@/lib/commander/store';
export const runtime = 'nodejs';
export function GET(request: Request) { return api(() => { protect(request); return Response.json({ ...configStatus(), workerReady: getStore().workerReady() }); }); }
