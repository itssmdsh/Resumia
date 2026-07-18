import { markDuplicateLinksComplete, pendingJobs, saveParsedJob, updateQueue } from '../database/supabase.js';
import { parseJob } from '../ai/parser.js';
import { retry } from '../utils/retry.js';
import { log } from '../utils/logger.js';

async function processOne({ db, queue, config, browser }) {
  const started = Date.now();
  await updateQueue(db, queue.id, { parsing_status: 'processing', parse_attempts: (queue.parse_attempts || 0) + 1, parse_error: null });
  try {
    let http;
    try {
      http = await retry(() => import('../scraper/httpScraper.js').then(({ extractByHttp }) => extractByHttp(queue.apply_url, config.httpThreshold)));
    } catch (error) {
      // Removed listings should fail quickly. Bot blocks and timeouts can still be rendered by Playwright.
      if (/received (404|410)/.test(error.message)) throw error;
      log('http_extraction_failed_falling_back', { queueId: queue.id, url: queue.apply_url, error: error.message });
      http = { accepted: false };
    }
    const extraction = http.accepted ? http : await browser.extract(queue.apply_url);
    if (!extraction.accepted) throw new Error(`No usable job text (score ${extraction.score}, ${extraction.content.length} chars)`);
    const aiStarted = Date.now();
    const job = await parseJob(config.parserApiUrl, { url: queue.apply_url, hostname: new URL(queue.apply_url).hostname, title: '', content: extraction.content.slice(0, 60000) });
    await saveParsedJob(db, queue, job);
    await markDuplicateLinksComplete(db, queue);
    await updateQueue(db, queue.id, { parsing_status: 'completed', parsed_at: new Date().toISOString() });
    log('job_completed', { queueId: queue.id, url: queue.apply_url, company: job.company?.name, method: extraction.method, extractionScore: extraction.score, aiMs: Date.now() - aiStarted, totalMs: Date.now() - started });
    return { status: 'completed', method: extraction.method };
  } catch (error) {
    await updateQueue(db, queue.id, { parsing_status: 'failed', parse_error: error.message.slice(0, 2000) });
    log('job_failed', { queueId: queue.id, url: queue.apply_url, error: error.message, totalMs: Date.now() - started });
    return { status: 'failed' };
  }
}

export async function processQueue({ db, config, browser }) {
  const queue = await pendingJobs(db, config.batchLimit);
  const uniqueQueue = [...new Map(queue.map((item) => [item.apply_url, item])).values()];
  const report = { requested: uniqueQueue.length, duplicateLinksSkipped: queue.length - uniqueQueue.length, completed: 0, failed: 0, http: 0, playwright: 0 };
  log('batch_started', { queued: uniqueQueue.length, fetched: queue.length, limit: config.batchLimit, concurrency: config.concurrency });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(config.concurrency, uniqueQueue.length) }, async () => {
    while (next < uniqueQueue.length) {
      const item = uniqueQueue[next++];
      const result = await processOne({ db, queue: item, config, browser });
      report[result.status] += 1;
      if (result.method) report[result.method] += 1;
    }
  }));
  log('batch_finished', report);
  return report;
}
