import { getConfig } from './config.js';
import { runScraper } from './discoveryScraper.js';
import {
  extractApplyUrl,
  fetchHtml,
  isLikelyDirectApplicationUrl,
  isUnhelpfulDestination,
  resolveRedirects,
} from './extractApplyUrl.js';
import {
  deleteFailure,
  enqueueNewJobs,
  getFailedJobs,
  getPendingJobs,
  moveJobToFailures,
  updateJob,
} from './supabaseQueue.js';

const config = getConfig();

if (config.discoverySources.length) {
  const discovered = await runScraper(config.discoverySources, config.discoveryTimeframe);
  await enqueueNewJobs(config, discovered.map(({ url }) => url));
  console.log(`Queued ${discovered.length} discovered link(s), ignoring existing rows`);
} else {
  console.log('No discovery sources configured; processing the existing Supabase queue');
}

const failedJobs = await getFailedJobs(config);
await enqueueNewJobs(config, failedJobs.map(({ source_url: sourceUrl }) => sourceUrl));
console.log(`Requeued ${failedJobs.length} failed link(s) for retry`);

const jobs = await getPendingJobs(config);

console.log(`Found ${jobs.length} pending job link(s)`);

let succeeded = 0;
let failed = 0;
let nextJobIndex = 0;

async function processNextJobs() {
  while (nextJobIndex < jobs.length) {
    const job = jobs[nextJobIndex];
    nextJobIndex += 1;

    try {
      let finalApplyUrl;
      if (isLikelyDirectApplicationUrl(job.source_url)) {
        finalApplyUrl = await resolveRedirects(job.source_url, config.requestTimeoutMs);
      } else {
        const html = await fetchHtml(job.source_url, config.requestTimeoutMs);
        const applyUrl = extractApplyUrl(html, job.source_url);
        finalApplyUrl = await resolveRedirects(applyUrl, config.requestTimeoutMs);
      }

      if (isUnhelpfulDestination(finalApplyUrl, job.source_url)) {
        throw new Error('Apply link resolved to a generic, social, or error page');
      }

      await updateJob(config, job.id, {
        apply_url: finalApplyUrl,
        extraction_status: 'success',
        error_message: null,
      });
      await deleteFailure(config, job.source_url);
      succeeded += 1;
      console.log(`Success: ${job.source_url} -> ${finalApplyUrl}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await moveJobToFailures(config, job, message.slice(0, 1_000));
      console.error(`Failed: ${job.source_url}: ${message}`);
    }
  }
}

const workerCount = Math.min(config.processConcurrency, jobs.length);
await Promise.all(Array.from({ length: workerCount }, () => processNextJobs()));

console.log(`Finished: ${succeeded} succeeded, ${failed} failed`);
