import { retry } from '../utils/retry.js';
export class ParserApiError extends Error {
  constructor(message, { status, rawResponse, aiRawResponse }) {
    super(message); this.name = 'ParserApiError'; this.httpStatus = status; this.rawResponse = rawResponse; this.aiRawResponse = aiRawResponse;
  }
}
export async function parseJob(parserApiUrl, payload) {
  return retry(async () => {
    const response = await fetch(`${parserApiUrl}/api/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(70000) });
    const rawResponse = await response.text();
    const body = JSON.parse(rawResponse || '{}');
    if (!response.ok || !body.success || !body.job) throw new ParserApiError(body.error || `Parser API returned ${response.status}`, { status: response.status, rawResponse, aiRawResponse: body.debug?.rawAiResponse });
    return body.job;
  });
}
