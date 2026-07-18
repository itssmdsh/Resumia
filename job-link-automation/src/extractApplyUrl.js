const APPLY_TEXT = /\bapply(?:\s+(?:link|now|here|for (?:this )?job))?\b/i;
const EXCLUDED_TEXT = /\b(?:how|who|why|before|should|can|to)\s+apply\b/i;

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function textOnly(html) {
  return decodeHtml(html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function linksFromHtml(html, pageUrl) {
  const links = [];
  const anchorPattern = /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = decodeHtml(match[3].trim());
    const text = textOnly(match[5]);
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) continue;

    try {
      links.push({ url: new URL(href, pageUrl).href, text });
    } catch {
      // Ignore malformed links and keep evaluating other candidates.
    }
  }

  return links;
}

function scoreCandidate(candidate, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '');
  const targetHost = new URL(candidate.url).hostname.replace(/^www\./, '');
  const isExternal = targetHost !== sourceHost;
  let score = 0;

  if (/^apply link$/i.test(candidate.text)) score += 100;
  else if (/^apply (?:now|here)$/i.test(candidate.text)) score += 80;
  else if (isExternal && /^click here(?: to apply)?$/i.test(candidate.text)) score += 70;
  else if (
    APPLY_TEXT.test(candidate.text)
    && !EXCLUDED_TEXT.test(candidate.text)
    && (isExternal || candidate.text.length <= 30)
  ) score += 40;

  // Domain or path shape alone is not evidence that a link is an Apply link.
  if (score === 0) return 0;

  if (isExternal) score += 25;
  if (/\/(?:job|jobs|career|careers|apply)\b/i.test(candidate.url)) score += 10;
  if (/facebook|twitter|whatsapp|telegram|linkedin|(?:^|\.)t\.me$/i.test(targetHost)) score -= 100;

  return score;
}

const INTERMEDIARY_HOSTS = [
  'jobcode.in',
  'jobssforu.in',
  'onlinestudy4u.in',
  'trackutech.com',
  'newoffcampusjobs.com',
  'tinyurl.com',
  'bit.ly',
  'forbes.com',
];

export function isLikelyDirectApplicationUrl(value) {
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const path = url.pathname.toLowerCase();

  if (INTERMEDIARY_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return false;
  }
  if (/recruitee\.com$/.test(host) && /\/open-positions?\/?$/.test(path)) return false;

  const directHost =
    /(?:myworkdayjobs|greenhouse|lever|smartrecruiters|amazon\.jobs|ultipro|brassring|csod|oraclecloud|zoho|dayforce|naukri|joinsuperset|testedrecruits|myanatomy|tcsion)\./i.test(host)
    || /^(?:jobs?|careers?|apply)\./i.test(host);
  const directPath =
    /\/(?:jobs?|jobdetail|opportunitydetail|requisition|posting|applications\/jobs|candidateexperience|careers\/job)\b/i.test(path)
    || /\/careers\/[^/]+\/[^/]+/i.test(path);

  return directHost || directPath || (
    host === 'docs.google.com'
    && path.includes('/forms/')
  ) || host === 'surveys.infosysapps.com';
}

export function isUnhelpfulDestination(value, sourceValue) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const sourceHost = sourceValue
    ? new URL(sourceValue).hostname.replace(/^www\./, '').toLowerCase()
    : null;
  const normalizedHost = host.replace(/^www\./, '');
  const isRelatedIntermediaryArticle =
    sourceHost === normalizedHost
    && INTERMEDIARY_HOSTS.some(
      (domain) => normalizedHost === domain || normalizedHost.endsWith(`.${domain}`),
    );

  return /facebook|twitter|instagram|whatsapp|telegram|linkedin|(?:^|\.)t\.me$/i.test(host)
    || /(?:^|\/)(?:error|errors|maintenance|service-unavailable)(?:\/|$)/i.test(path)
    || /\/(?:careers|jobs|jobsearch|open-positions|join)$/.test(path)
    || /\/closedform$/.test(path)
    || /\.pdf$/i.test(path)
    || url.searchParams.get('error') === 'true'
    || path === '/'
    || isRelatedIntermediaryArticle;
}

export function extractApplyUrl(html, sourceUrl) {
  const ranked = linksFromHtml(html, sourceUrl)
    .map((candidate) => ({ ...candidate, score: scoreCandidate(candidate, sourceUrl) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) throw new Error('No Apply link was found on the source page');
  return ranked[0].url;
}

export async function fetchHtml(url, timeoutMs) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'Mozilla/5.0 (compatible; ResumiaJobLinkBot/1.0)',
    },
  });

  if (!response.ok) throw new Error(`Source page returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) throw new Error(`Expected HTML but received ${contentType || 'unknown content'}`);
  return response.text();
}

export async function resolveRedirects(url, timeoutMs) {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; ResumiaJobLinkBot/1.0)' },
  });

  const finalUrl = response.url || url;
  const destination = new URL(finalUrl);
  const isTemporaryDestination =
    destination.hostname === 'community.workday.com'
    || /(?:maintenance|downtime|service-unavailable|error-page)/i.test(destination.pathname);

  return isTemporaryDestination ? url : finalUrl;
}
