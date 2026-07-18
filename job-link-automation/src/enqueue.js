import { getConfig } from './config.js';
import { enqueueJobs } from './supabaseQueue.js';

const sourceUrls = process.argv.slice(2).map((value) => {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
  return url.href;
});

if (!sourceUrls.length) {
  throw new Error('Provide at least one source URL: npm run enqueue -- https://example.com/job');
}

await enqueueJobs(getConfig(), sourceUrls);
console.log(`Queued ${sourceUrls.length} job link(s)`);
