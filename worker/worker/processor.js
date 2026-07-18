import { pendingJobs, saveParsedJob, updateQueue } from '../database/supabase.js';
import { parseJob } from '../ai/parser.js';
import { retry } from '../utils/retry.js';
import { log } from '../utils/logger.js';

async function processOne({ db, queue, config, browser }) {
  const started = Date.now();
  await updateQueue(db, queue.id, { status: 'processing', attempts: (queue.attempts || 0) + 1, last_error: null });
  try {
    const http = await retry(() => import('../scraper/httpScraper.js').then(({ extractByHttp }) => extractByHttp(queue.url, config.httpThreshold)));
    const extraction = http.accepted ? http : await browser.extract(queue.url);
    if (!extraction.accepted) throw new Error(`No usable job text (score ${extraction.score}, ${extraction.content.length} chars)`);
    const aiStarted = Date.now();
    const job = await parseJob(config.parserApiUrl, { url: queue.url, hostname: new URL(queue.url).hostname, title: '', content: extraction.content.slice(0, 60000) });
    await saveParsedJob(db, queue, job);
    await updateQueue(db, queue.id, { status: 'completed', completed_at: new Date().toISOString() });
    log('job_completed', { queueId: queue.id, url: queue.url, company: job.company?.name, method: extraction.method, extractionScore: extraction.score, aiMs: Date.now() - aiStarted, totalMs: Date.now() - started });
    return { status: 'completed', method: extraction.method };
  } catch (error) {
    await updateQueue(db, queue.id, { status: 'failed', last_error: error.message.slice(0, 2000) });
    log('job_failed', { queueId: queue.id, url: queue.url, error: error.message, totalMs: Date.now() - started });
    return { status: 'failed' };
  }
}

export async function processQueue({ db, config, browser }) {
  const queue = await pendingJobs(db, config.batchLimit);
  const report = { requested: queue.length, completed: 0, failed: 0, http: 0, playwright: 0 };
  log('batch_started', { queued: queue.length, limit: config.batchLimit });
  for (const item of queue) {
    const result = await processOne({ db, queue: item, config, browser });
    report[result.status] += 1;
    if (result.method) report[result.method] += 1;
  }
  log('batch_finished', report);
  return report;
}
