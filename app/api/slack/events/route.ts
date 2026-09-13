import { z } from 'zod';
import { api, HttpError, readLimited } from '@/lib/commander/auth';
import { verifySlack } from '@/lib/commander/slack';
import { getStore } from '@/lib/commander/store';
import { liveConfig } from '@/lib/commander/config';
export const runtime = 'nodejs';
const envelope = z.object({ type: z.string(), challenge: z.string().optional(), team_id: z.string().optional(), event_id: z.string().optional(), event: z.object({ type: z.string(), channel: z.string().optional(), ts: z.string().optional(), thread_ts: z.string().optional(), bot_id: z.string().optional(), subtype: z.string().optional(), text: z.string().optional() }).optional() });
export function POST(request: Request) { return api(async () => {
  const raw = await readLimited(request);
  if (!verifySlack(raw, request.headers.get('x-slack-request-timestamp'), request.headers.get('x-slack-signature'), process.env.SLACK_SIGNING_SECRET || '')) throw new HttpError(401, 'Invalid Slack signature or timestamp');
  let parsed;
  try { parsed = envelope.parse(JSON.parse(raw)); } catch { throw new HttpError(400, 'Invalid Slack event'); }
  if (parsed.type === 'url_verification' && parsed.challenge) return Response.json({ challenge: parsed.challenge });
  if (parsed.team_id !== process.env.SLACK_TEAM_ID) throw new HttpError(403, 'Slack workspace is not allowed');
  const event = parsed.event;
  if (parsed.type !== 'event_callback' || !event || event.type !== 'app_mention' || event.bot_id || event.subtype || event.channel !== process.env.SLACK_INCIDENT_CHANNEL_ID || !event.ts || !parsed.event_id || !/\b(investigate|checkout|incident)\b/i.test(event.text || '')) return Response.json({ ignored: true });
  try { liveConfig(); } catch { throw new HttpError(503, 'Live mode is not configured/enabled'); }
  const run = getStore().enqueue({ eventKey: 'slack:' + parsed.event_id, mode: 'live', scenario: 'checkout-regression', source: 'slack', channel: event.channel, threadTs: event.thread_ts || event.ts, title: 'Slack-triggered checkout incident' });
  // Durable enqueue only: no model or provider call on Slack's acknowledgment path.
  return Response.json({ accepted: true, incidentId: run.id });
}); }
