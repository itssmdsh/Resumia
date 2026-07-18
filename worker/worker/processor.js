import { claimJob, finishAttempt, lifecycleSummary, markDuplicateLinksComplete, pendingJobs, recoverStaleProcessing, requeueRetryableUnparsedLinks, saveParsedJob, startAttempt, updateQueue } from '../database/supabase.js';
import { companyFromUrl } from '../database/jobRecord.js';
import { parseJob } from '../ai/parser.js';
import { retry } from '../utils/retry.js';
import { log } from '../utils/logger.js';

function classifyFailure(error) {
  const status = Number(error?.httpStatus);
  const message = error?.message || 'Unknown error';
  if ([404, 410].includes(status) || /received (404|410)/.test(message)) return { outcome: 'expired', failureClass: 'expired_url' };
  if ([401, 403].includes(status) || /received (401|403)/.test(message)) return { outcome: 'failed', failureClass: 'access_blocked' };
  if (/timeout|aborted/i.test(message)) return { outcome: 'failed', failureClass: 'timeout' };
  if (/No usable job text/i.test(message)) return { outcome: 'failed', failureClass: 'no_usable_content' };
  if (/parse|JSON|schema|Parser API/i.test(message)) return { outcome: 'failed', failureClass: 'parser_failure' };
  return { outcome: 'failed', failureClass: 'worker_failure' };
}

async function processOne({ db, queue, config, browser }) {
  const started = Date.now();
  const claimed = await claimJob(db, queue.id);
  if (!claimed) return { status: 'skipped', skipped: 1 };
  const attemptId = await startAttempt(db, claimed);
  let extraction = null;
  let aiRawResponse = null;
  try {
    let http;
    try {
      http = await retry(() => import('../scraper/httpScraper.js').then(({ extractByHttp }) => extractByHttp(claimed.apply_url, config.httpThreshold)));
    } catch (error) {
      if (/received (404|410)/.test(error.message)) throw error;
      log('http_extraction_failed_falling_back', { queueId: claimed.id, url: claimed.apply_url, error: error.message });
      http = { accepted: false, httpStatus: error.httpStatus || null };
    }
    extraction = http.accepted ? http : await browser.extract(claimed.apply_url);
    if (!extraction.accepted) throw new Error(`No usable job text (score ${extraction.score}, ${extraction.content.length} chars)`);
    const aiStarted = Date.now();
    const job = await parseJob(config.parserApiUrl, { url: claimed.apply_url, hostname: new URL(claimed.apply_url).hostname, title: '', content: extraction.content.slice(0, 60000) });
    await saveParsedJob(db, claimed, job);
    await markDuplicateLinksComplete(db, claimed);
    await updateQueue(db, claimed.id, { parsing_status: 'completed', parse_method: extraction.method, parsed_at: new Date().toISOString() });
    await finishAttempt(db, attemptId, { outcome: 'completed', company: job.company?.name || companyFromUrl(claimed.apply_url), extraction_method: extraction.method, extraction_score: extraction.score, raw_content: extraction.content.slice(0, 60000), retry_count: Math.max(0, claimed.parse_attempts - 1), duration_ms: Date.now() - started });
    log('job_completed', { queueId: claimed.id, url: claimed.apply_url, company: job.company?.name, method: extraction.method, extractionScore: extraction.score, aiMs: Date.now() - aiStarted, totalMs: Date.now() - started });
    return { status: 'completed', method: extraction.method, aiSuccess: 1 };
  } catch (error) {
    aiRawResponse = error.aiRawResponse || error.rawAiResponse || error.rawResponse || null;
    const classification = classifyFailure(error);
    const method = extraction?.method || null;
    const score = extraction?.score ?? null;
    const rawContent = extraction?.content?.slice(0, 60000) || null;
    await updateQueue(db, claimed.id, { parsing_status: classification.outcome, parse_error: error.message.slice(0, 2000), parse_failure_class: classification.failureClass, parse_method: method });
    await finishAttempt(db, attemptId, { outcome: classification.outcome, failure_class: classification.failureClass, company: companyFromUrl(claimed.apply_url, claimed.source_url), extraction_method: method, extraction_score: score, http_status: error.httpStatus || null, raw_content: rawContent, ai_raw_response: aiRawResponse?.slice(0, 60000) || null, error_message: error.message.slice(0, 5000), stack_trace: error.stack?.slice(0, 10000) || null, retry_count: Math.max(0, claimed.parse_attempts - 1), duration_ms: Date.now() - started });
    log('job_failed', { queueId: claimed.id, url: claimed.apply_url, failureClass: classification.failureClass, error: error.message, totalMs: Date.now() - started });
    return { status: classification.outcome, method, failureClass: classification.failureClass };
  }
}

export async function processQueue({ db, config, browser }) {
  const recovered = await recoverStaleProcessing(db);
  const requeuedForRetry = await requeueRetryableUnparsedLinks(db, config.batchLimit);
  const queue = await pendingJobs(db, config.batchLimit);
  const uniqueQueue = [...new Map(queue.map((item) => [item.apply_url, item])).values()];
  const report = { fetched: queue.length, requested: uniqueQueue.length, duplicates: queue.length - uniqueQueue.length, completed: 0, failed: 0, expired: 0, skipped: 0, httpSuccess: 0, playwrightSuccess: 0, aiSuccess: 0, httpFailures: 0, playwrightFailures: 0, parserFailures: 0, timeouts: 0, accessBlocked: 0, recoveredStale: recovered, requeuedForRetry, startedAt: Date.now() };
  log('batch_started', { queued: uniqueQueue.length, fetched: queue.length, limit: config.batchLimit, concurrency: config.concurrency, recoveredStale: recovered, requeuedForRetry });
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(config.concurrency, uniqueQueue.length) }, async () => {
    while (next < uniqueQueue.length) {
      const result = await processOne({ db, queue: uniqueQueue[next++], config, browser });
      report[result.status] += 1;
      if (result.method === 'http') report.httpSuccess += result.status === 'completed' ? 1 : 0;
      if (result.method === 'playwright') report.playwrightSuccess += result.status === 'completed' ? 1 : 0;
      report.aiSuccess += result.aiSuccess || 0;
      if (result.failureClass === 'parser_failure') report.parserFailures += 1;
      if (result.failureClass === 'timeout') report.timeouts += 1;
      if (result.failureClass === 'access_blocked') report.accessBlocked += 1;
      if (result.status !== 'completed' && result.method === 'http') report.httpFailures += 1;
      if (result.status !== 'completed' && result.method === 'playwright') report.playwrightFailures += 1;
    }
  }));
  report.totalProcessingMs = Date.now() - report.startedAt;
  delete report.startedAt;
  report.lifecycle = await lifecycleSummary(db);
  log('batch_finished', report);
  return report;
}
