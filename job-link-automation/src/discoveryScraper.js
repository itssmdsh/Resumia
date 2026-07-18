import axios from 'axios';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

const requestOptions = {
  headers: {
    'user-agent': 'Mozilla/5.0 (compatible; ResumiaJobDiscoveryBot/1.0)',
    'accept-language': 'en-US,en;q=0.9',
  },
  timeout: 10_000,
};

export async function getChannelIdFromUrl(value) {
  if (!value) return null;
  const url = value.trim();
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(url)) return url;

  const channelIdMatch = url.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
  if (channelIdMatch) return channelIdMatch[1];

  const handleMatch = url.match(/@([a-zA-Z0-9._-]+)/);
  const fetchUrl = handleMatch
    ? `https://www.youtube.com/@${handleMatch[1]}`
    : url;

  try {
    const { data: html } = await axios.get(fetchUrl, requestOptions);
    const patterns = [
      /<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})"/,
      /"channelId":"(UC[a-zA-Z0-9_-]{22})"/,
      /"externalId":"(UC[a-zA-Z0-9_-]{22})"/,
      /feeds\/videos\.xml\?channel_id=(UC[a-zA-Z0-9_-]{22})/,
      /youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/,
    ];
    return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) || null;
  } catch (error) {
    console.error(`Error resolving YouTube channel ${url}: ${error.message}`);
    return null;
  }
}

export function isSpamOrExcluded(link) {
  try {
    const host = new URL(link).hostname.toLowerCase();
    return [
      'youtube.com', 'youtu.be', 'whatsapp.com', 'wa.me', 't.me',
      'telegram.me', 'telegram.dog', 'telegram.org', 'facebook.com',
      'fb.me', 'twitter.com', 'x.com', 'instagram.com', 'instagr.am',
      'linkedin.com', 'pinterest.com', 'reddit.com', 'atsbasedresume.com',
      'courses.store', 'topmate.io', 'drive.google.com', 'leetcode.com',
    ].some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return true;
  }
}

export function extractUrls(text) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s"'<>()[\]]+/gi) || [];
  return [...new Set(matches
    .map((link) => link.replace(/[.,;:!?]+$/, ''))
    .filter((link) => !isSpamOrExcluded(link)))];
}

async function scrapeYouTube(channelUrl, cutoffDate) {
  const channelId = await getChannelIdFromUrl(channelUrl);
  if (!channelId) return [];

  try {
    const { data } = await axios.get(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      requestOptions,
    );
    const parsed = xmlParser.parse(data);
    const rawEntries = parsed?.feed?.entry || [];
    const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

    return [...new Set(entries.flatMap((entry) => {
      if (cutoffDate && entry.published && new Date(entry.published) < cutoffDate) return [];
      const media = entry?.['media:group'];
      const description =
        media?.['media:description']
        || entry?.['media:description']
        || entry?.summary
        || '';
      return extractUrls(description);
    }))];
  } catch (error) {
    console.error(`Error scraping YouTube ${channelUrl}: ${error.message}`);
    return [];
  }
}

function isBoilerplateWebsiteUrl(candidate, sourceUrl) {
  const target = new URL(candidate);
  const source = new URL(sourceUrl);
  const pathname = target.pathname.toLowerCase();
  if (target.hostname.replace(/^www\./, '') !== source.hostname.replace(/^www\./, '')) return false;
  if (pathname === '/') return true;

  return [
    '/about', '/contact', '/privacy', '/terms', '/disclaimer', '/category/',
    '/tag/', '/page/', '/wp-admin', '/feed', '/author', '/xmlrpc',
    '/wp-content', '/wp-includes',
  ].some((pattern) => pathname.includes(pattern));
}

async function scrapeWebsite(url) {
  try {
    const { data } = await axios.get(url, requestOptions);
    const $ = cheerio.load(data);
    const urls = [];

    $('a[href]').each((_index, element) => {
      try {
        const resolved = new URL($(element).attr('href'), url).href;
        const pathname = new URL(resolved).pathname;
        if (!/^https?:/i.test(resolved)) return;
        if (isSpamOrExcluded(resolved) || isBoilerplateWebsiteUrl(resolved, url)) return;
        if (/\.(png|jpe?g|gif|svg|css|js|pdf|ico|zip|rar)$/i.test(pathname)) return;
        urls.push(resolved);
      } catch {
        // Ignore malformed links.
      }
    });

    return [...new Set(urls)];
  } catch (error) {
    console.error(`Error scraping website ${url}: ${error.message}`);
    return [];
  }
}

async function scrapeTelegramChannel(url, cutoffDate) {
  const channelName = url.match(/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_-]+)/i)?.[1];
  if (!channelName) return [];

  try {
    const { data } = await axios.get(`https://t.me/s/${channelName}`, requestOptions);
    const $ = cheerio.load(data);
    const urls = [];

    $('.tgme_widget_message').each((_index, message) => {
      const datetime = $(message).find('time.time').attr('datetime');
      if (cutoffDate && datetime && new Date(datetime) < cutoffDate) return;

      $(message).find('.tgme_widget_message_text a[href]').each((_linkIndex, anchor) => {
        try {
          const resolved = new URL($(anchor).attr('href')).href;
          if (!isSpamOrExcluded(resolved)) urls.push(resolved);
        } catch {
          // Ignore malformed links.
        }
      });
    });
    return [...new Set(urls)];
  } catch (error) {
    console.error(`Error scraping Telegram ${url}: ${error.message}`);
    return [];
  }
}

function cutoffFor(timeframe) {
  const durations = {
    '24h': 24 * 60 * 60 * 1_000,
    '48h': 48 * 60 * 60 * 1_000,
    '72h': 72 * 60 * 60 * 1_000,
    '1w': 7 * 24 * 60 * 60 * 1_000,
  };
  return durations[timeframe] ? new Date(Date.now() - durations[timeframe]) : null;
}

export async function runScraper(channels = [], timeframe = 'all') {
  if (!channels.length) return [];
  const cutoffDate = cutoffFor(timeframe);

  const results = await Promise.all(channels.map(async (source) => {
    const lower = source.toLowerCase();
    let urls;
    if (lower.includes('youtube.com') || lower.includes('youtu.be') || source.startsWith('@')) {
      urls = await scrapeYouTube(source, cutoffDate);
    } else if (lower.includes('t.me') || lower.includes('telegram.me')) {
      urls = await scrapeTelegramChannel(source, cutoffDate);
    } else {
      urls = await scrapeWebsite(source);
    }
    console.log(`Discovered ${urls.length} link(s) from ${source}`);
    return urls.map((url) => ({ url, source }));
  }));

  const seen = new Set();
  return results.flat().filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}
