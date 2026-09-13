import { createHmac } from 'node:crypto';
import { equal } from './auth';
export function verifySlack(body: string, timestamp: string | null, signature: string | null, secret: string, now = Date.now()) {
  if (!secret || !timestamp || !/^\d{10}$/.test(timestamp) || !signature || !/^v0=[a-f0-9]{64}$/.test(signature) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  return equal(signature, 'v0=' + createHmac('sha256', secret).update('v0:' + timestamp + ':' + body).digest('hex'));
}
