import * as cheerio from 'cheerio';

const APPLY_TEXT = /\bapply(?:\s+(?:link|now|here|for (?:this )?job))?\b/i;
const EXCLUDED_TEXT = /\b(?:how|who|why|before|should|can|to)\s+apply\b/i;
const APPLY_CONTEXT =
  /\b(?:how to apply|apply|application|hiring link|job link|recruitment link|off[ -]?campus(?: hiring)? link)\b/i;
const CONTENT_ROOTS = [
  'article .entry-content',
  '.entry-content',
  '.post-content',
  '.td-post-content',
  '.inside-article',
  'article',
  'main',
  'body',
];
const REMOVED_CONTENT = [
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'aside',
  'iframe',
  '.sidebar',
  '.widget',
  '.related-posts',
  '.related-post',
  '.recent-posts',
  '.recommended-posts',
  '.advertisement',
  '.adsbygoogle',
  '[class*="advert"]',
  '[id*="advert"]',
  '[class~="ad"]',
  '[id~="ad"]',
].join(',');
const AD_HOST =
  /(?:^|\.)(?:doubleclick\.net|googlesyndication\.com|googleadservices\.com|adservice\.google\.com|taboola\.com|outbrain\.com)$/i;

function decodeHtml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function linksFromHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  $(REMOVED_CONTENT).remove();

  let root = $('body');
  for (const selector of CONTENT_ROOTS) {
    const candidate = $(selector).first();
    if (candidate.length) {
      root = candidate;
      break;
    }
  }

  const links = [];
  let latestHeading = '';
  const contentNodes = root.find('h1,h2,h3,h4,h5,h6,a').addBack('h1,h2,h3,h4,h5,h6,a');

  contentNodes.each((_, element) => {
    if (/^h[1-6]$/i.test(element.tagName)) {
      latestHeading = $(element).text().replace(/\s+/g, ' ').trim();
      return;
    }

    const href = decodeHtml(($(element).attr('href') || '').trim());
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;

    try {
      const parentText = $(element).parent().text().replace(/\s+/g, ' ').trim().slice(0, 300);
      links.push({
        url: new URL(href, pageUrl).href,
        text,
        context: `${latestHeading} ${parentText}`.trim(),
      });
    } catch {
      // Ignore malformed links and keep evaluating other candidates.
    }
  });

  return links;
}

function scoreCandidate(candidate, sourceUrl) {
  const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '');
  const targetHost = new URL(candidate.url).hostname.replace(/^www\./, '');
  const isExternal = targetHost !== sourceHost;
  const isDirect = isLikelyDirectApplicationUrl(candidate.url);
  const hasApplyContext = APPLY_CONTEXT.test(candidate.context);
  let score = 0;

  if (/facebook|twitter|instagram|whatsapp|telegram|linkedin|(?:^|\.)t\.me$/i.test(targetHost)) {
    return 0;
  }
  if (AD_HOST.test(targetHost)) return 0;

  if (/^apply link$/i.test(candidate.text) && (hasApplyContext || isDirect)) score += 100;
  else if (/^apply (?:now|here)$/i.test(candidate.text) && (hasApplyContext || isDirect)) score += 80;
  else if (
    isExternal
    && /^click here(?: to apply)?$/i.test(candidate.text)
    && (hasApplyContext || isDirect)
  ) score += 70;
  else if (
    APPLY_TEXT.test(candidate.text)
    && !EXCLUDED_TEXT.test(candidate.text)
    && (hasApplyContext || isDirect)
    && (isExternal || candidate.text.length <= 30)
  ) score += 40;

  // Domain or path shape alone is not evidence that a link is an Apply link.
  if (score === 0) return 0;

  if (isExternal) score += 25;
  if (hasApplyContext) score += 20;
  if (isDirect) score += 30;
  if (/\/(?:job|jobs|career|careers|apply)\b/i.test(candidate.url)) score += 10;

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

export function isShortenedUrl(value) {
  const host = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  return host === 'bit.ly' || host === 'tinyurl.com';
}

export function canonicalizeKnownApplicationUrl(value) {
  const url = new URL(value);
  const ashbyJobId = url.searchParams.get('ashby_jid');
  const proxyMatch = url.hostname.match(/^([a-z0-9-]+)-sanity-proxied\.vercel\.app$/i);

  if (ashbyJobId && proxyMatch && /^[0-9a-f-]{36}$/i.test(ashbyJobId)) {
    const company = proxyMatch[1].replace(/(^|-)([a-z])/g, (_, separator, letter) => (
      `${separator}${letter.toUpperCase()}`
    ));
    return `https://jobs.ashbyhq.com/${company}/${ashbyJobId}`;
  }

  return value;
}

export function isLikelyDirectApplicationUrl(value) {
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const path = url.pathname.toLowerCase();
  const hash = url.hash.toLowerCase();

  if (INTERMEDIARY_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    return false;
  }
  if (/recruitee\.com$/.test(host) && /\/open-positions?\/?$/.test(path)) return false;

  const directHost =
    /(?:myworkdayjobs|greenhouse|lever|smartrecruiters|amazon\.jobs|ultipro|brassring|csod|oraclecloud|zoho|dayforce|naukri|joinsuperset|testedrecruits|myanatomy|tcsion)\./i.test(host)
    || /^(?:jobs?|careers?|apply)\./i.test(host);
  const directPath =
    /\/(?:jobs?|jobdetail|opportunitydetail|requisition|posting|applications\/jobs|candidateexperience|careers\/job)\b/i.test(path)
    || /\/careers\/[^/]+\/[^/]+/i.test(path)
    || /\/entry-level-software-engineer\/?$/i.test(path);

  return directHost || directPath || /\/jobprofiles\//i.test(hash) || (
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
  const isJoinSupersetApplication =
    /(?:^|\.)joinsuperset\.com$/i.test(normalizedHost)
    && /\/jobprofiles\//i.test(url.hash);

  return !isJoinSupersetApplication && (
    AD_HOST.test(normalizedHost)
    || /facebook|twitter|instagram|whatsapp|telegram|linkedin|(?:^|\.)t\.me$/i.test(host)
    || /(?:^|\/)(?:error|errors|maintenance|service-unavailable)(?:\/|$)/i.test(path)
    || /\/(?:careers|jobs|jobsearch|open-positions|join)$/.test(path)
    || /\/closedform$/.test(path)
    || /\.pdf$/i.test(path)
    || url.searchParams.get('error') === 'true'
    || path === '/'
    || isRelatedIntermediaryArticle
  );
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
  const original = new URL(url);
  const destination = new URL(finalUrl);
  const isTemporaryDestination =
    destination.hostname === 'community.workday.com'
    || /(?:maintenance|downtime|service-unavailable|error-page)/i.test(destination.pathname);
  const isClientSideApplicationRoute =
    /joinsuperset/i.test(original.hostname)
    && /\/jobprofiles\//i.test(original.hash);

  if (
    original.hash
    && !destination.hash
    && original.hostname === destination.hostname
    && original.pathname.replace(/\/+$/, '') === destination.pathname.replace(/\/+$/, '')
  ) {
    destination.hash = original.hash;
  }

  return isTemporaryDestination || isClientSideApplicationRoute ? url : destination.href;
}
