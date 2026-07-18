import { getConfig } from './config.js';
import { extractApplyUrl, fetchHtml, resolveRedirects } from './extractApplyUrl.js';
import { getPendingJobs, updateJob } from './supabaseQueue.js';

const config = getConfig();
const jobs = await getPendingJobs(config);

console.log(`Found ${jobs.length} pending job link(s)`);

let succeeded = 0;
let failed = 0;

for (const job of jobs) {
  try {
    const html = await fetchHtml(job.source_url, config.requestTimeoutMs);
    const applyUrl = extractApplyUrl(html, job.source_url);
    const finalApplyUrl = await resolveRedirects(applyUrl, config.requestTimeoutMs);

    await updateJob(config, job.id, {
      apply_url: finalApplyUrl,
      extraction_status: 'success',
      error_message: null,
    });
    succeeded += 1;
    console.log(`Success: ${job.source_url} -> ${finalApplyUrl}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(config, job.id, {
      extraction_status: 'failed',
      error_message: message.slice(0, 1_000),
    });
    console.error(`Failed: ${job.source_url}: ${message}`);
  }
}

console.log(`Finished: ${succeeded} succeeded, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
