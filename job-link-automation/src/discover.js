import { runScraper } from './discoveryScraper.js';

const sources = process.argv.slice(2);
if (!sources.length) {
  throw new Error('Provide one or more website, YouTube, or Telegram source URLs');
}

const discovered = await runScraper(
  sources,
  process.env.DISCOVERY_TIMEFRAME?.trim() || 'all',
);
console.log(JSON.stringify(discovered, null, 2));
