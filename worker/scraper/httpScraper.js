import * as cheerio from 'cheerio';
import { cleanText, confidence, NOISE } from './cleaner.js';

export async function extractByHttp(url, threshold) {
  const response = await fetch(url, { headers: { 'User-Agent': 'AI-Job-Parser-Worker/1.0 (+https://github.com/itssmdsh/Resumia)', Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP extraction received ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,canvas,iframe,header,footer,nav,aside,form,dialog').remove();
  $('[class],[id],[data-testid],[data-automation-id]').each((_, element) => {
    const identity = [$(element).attr('class'), $(element).attr('id'), $(element).attr('data-testid'), $(element).attr('data-automation-id')].filter(Boolean).join(' ');
    if (NOISE.test(identity)) $(element).remove();
  });
  const content = cleanText($('body').text());
  const score = confidence(content);
  return { method: 'http', content, score, accepted: content.length >= 80 && score >= threshold };
}
