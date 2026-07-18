import { pendingJobs, saveParsedJob, updateQueue } from '../database/supabase.js';
import { parseJob } from '../ai/parser.js';
import { retry } from '../utils/retry.js';
import { log } from '../utils/logger.js';

async function processOne({ db, queue, config, browser }) {
  const started = Date.now();
  await updateQueue(db, queue.id, { parsing_status: 'processing', parse_attempts: (queue.parse_attempts || 0) + 1, parse_error: null });
  try {
    const http = await retry(() => import('../scraper/httpScraper.js').then(({ extractByHttp }) => extractByHttp(queue.apply_url, config.httpThreshold)));
    const extraction = http.accepted ? http : await browser.extract(queue.apply_url);
    if (!extraction.accepted) throw new Error(`No usable job text (score ${extraction.score}, ${extraction.content.length} chars)`);
    const aiStarted = Date.now();
    const job = await parseJob(config.parserApiUrl, { url: queue.apply_url, hostname: new URL(queue.apply_url).hostname, title: '', content: extraction.content.slice(0, 60000) });
    await saveParsedJob(db, queue, job);
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
  const report = { requested: queue.length, completed: 0, failed: 0, http: 0, playwright: 0 };
  log('batch_started', { queued: queue.length, limit: config.batchLimit, concurrency: config.concurrency });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(config.concurrency, queue.length) }, async () => {
    while (next < queue.length) {
      const item = queue[next++];
      const result = await processOne({ db, queue: item, config, browser });
      report[result.status] += 1;
      if (result.method) report[result.method] += 1;
    }
  }));
  log('batch_finished', report);
  return report;
}
