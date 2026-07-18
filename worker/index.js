import { assertWorkerConfig, config } from './config.js';
import { createDatabase } from './database/supabase.js';
import { PlaywrightScraper } from './scraper/playwrightScraper.js';
import { processQueue } from './worker/processor.js';
import { log } from './utils/logger.js';

const browser = new PlaywrightScraper();
try {
  assertWorkerConfig();
  const report = await processQueue({ db: createDatabase(config.supabaseUrl, config.supabaseKey), config, browser });
  log('worker_finished', report);
  // Individual inaccessible or expired listings are normal; only fatal worker failures fail the workflow.
  process.exitCode = 0;
} catch (error) {
  log('worker_fatal', { error: error.message });
  process.exitCode = 1;
} finally { await browser.close(); }
