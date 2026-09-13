export class ProviderError extends Error {
  constructor(message: string, public retryable = false, public ambiguous = false, public retryAfterMs = 0) { super(message); }
}
export const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function jsonRequest<T>(url: string, init: RequestInit = {}, options: { write?: boolean; retries?: number; onResponse?: (receipt: { status: number; requestId?: string }) => void } = {}): Promise<T> {
  const attempts = options.write ? 1 : (options.retries ?? 3);
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, { ...init, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(12000) });
      const retryAfter = Math.min(60000, Math.max(0, Number(response.headers.get('retry-after')) || 0) * 1000);
      if (!response.ok) {
        const isTransient = response.status === 429 || response.status >= 500;
        throw new ProviderError(new URL(url).hostname + ' returned HTTP ' + response.status, isTransient && (!options.write || response.status === 429), Boolean(options.write && response.status >= 500), retryAfter);
      }
      const text = await response.text();
      options.onResponse?.({ status: response.status, requestId: response.headers.get('x-vercel-id') || undefined });
      if (!text.trim()) return {} as T;
      try { return JSON.parse(text) as T; }
      catch { throw new ProviderError('Provider returned invalid JSON', false, Boolean(options.write)); }
    } catch (error) {
      const failure = error instanceof ProviderError ? error : new ProviderError('Provider request timed out or failed', !options.write, Boolean(options.write));
      if (!failure.retryable || attempt + 1 === attempts) throw failure;
      await sleep(Math.max(failure.retryAfterMs, 300 * 2 ** attempt));
    }
  }
  throw new Error('Request exhausted');
}
