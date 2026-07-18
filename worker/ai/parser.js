import { retry } from '../utils/retry.js';
export async function parseJob(parserApiUrl, payload) {
  return retry(async () => {
    const response = await fetch(`${parserApiUrl}/api/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(70000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success || !body.job) throw new Error(body.error || `Parser API returned ${response.status}`);
    return body.job;
  });
}
