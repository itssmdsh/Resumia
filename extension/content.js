// Generic, multi-stage job-page extractor. It intentionally contains no site-specific selectors.
(() => {
  const CONFIG = {
    minTextLength: 80,
    minJobScore: 3,
    maxTextLength: 60000,
    debug: new URLSearchParams(location.search).has('aiJobParserDebug'),
  };
  const KEYWORDS = [
    [/job\s*(description|responsibilities|details)?/g, 2], [/responsibilit(y|ies)/g, 2],
    [/(requirements?|qualifications?)/g, 2], [/(skills?|competenc(ies|y))/g, 1],
    [/(experience|education)/g, 1], [/(location|salary|benefits?)/g, 1],
    [/(employment\s*type|department|preferred|hiring|apply)/g, 1],
  ];
  const NOISE_SELECTOR = [
    'script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'header', 'footer', 'nav', 'aside', 'form',
    'dialog', '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[aria-modal="true"]',
  ].join(',');
  const NOISE_NAME = /cookie|consent|advert|sidebar|newsletter|breadcrumb|social[-_ ]?share|recommendation|related[-_ ]?jobs?|similar[-_ ]?jobs?|people[-_ ]?also[-_ ]?viewed|recent[-_ ]?search|(^|[-_ ])share|login|sign[-_ ]?up|register|chat|feedback|floating/i;
  const JOB_SECTION = /job|position|role|responsibilit|requirement|qualification|skill|competenc|experience|education|benefit|location|salary|employment|department|about.{0,12}(company|team|us)/i;

  function debug(...args) { if (CONFIG.debug) console.debug('[AI Job Parser]', ...args); }
  function normalise(text) { return (text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim(); }
  function textOf(node) { return normalise(node?.innerText || node?.textContent || ''); }
  function score(text) {
    const value = text.toLowerCase();
    return KEYWORDS.reduce((total, [pattern, weight]) => total + Math.min(3, (value.match(pattern) || []).length) * weight, 0);
  }
  function enough(text) { return text.length >= CONFIG.minTextLength && score(text) >= CONFIG.minJobScore; }

  function cleanClone() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll(NOISE_SELECTOR).forEach((node) => node.remove());
    // Removing by semantic names is safe on a detached tree and avoids geometry-based visibility checks.
    clone.querySelectorAll('[class],[id],[data-testid],[data-automation-id]').forEach((node) => {
      const identity = [node.className, node.id, node.getAttribute('data-testid'), node.getAttribute('data-automation-id')].join(' ');
      if (NOISE_NAME.test(identity)) node.remove();
    });
    return clone;
  }

  function tryMozillaReadability() {
    // Readability can be supplied by a bundled vendor file. Keeping this guarded lets the extractor
    // remain functional in an unpacked build while safely using Mozilla Readability when bundled.
    if (typeof globalThis.Readability !== 'function') return null;
    try {
      const readableDocument = document.implementation.createHTMLDocument(document.title);
      readableDocument.documentElement.innerHTML = document.documentElement.innerHTML;
      const article = new globalThis.Readability(readableDocument).parse();
      const content = normalise(article?.textContent);
      return enough(content) ? content : null;
    } catch (error) { debug('Readability failed', error); return null; }
  }

  function collectSemanticSections(root) {
    const candidates = [...root.querySelectorAll('main,article,section,div,dl,table,ul,ol')];
    const selected = [];
    for (const node of candidates) {
      const heading = textOf(node.querySelector('h1,h2,h3,h4,h5,strong,b,dt'));
      const text = textOf(node);
      if (text.length < 30 || text.length > 18000) continue;
      const identity = `${node.id} ${node.className} ${heading}`;
      if (JOB_SECTION.test(identity) || score(text) >= 2) selected.push({ node, text });
    }
    // Retain outer sections first; do not duplicate every nested card in the final description.
    const topLevel = selected.filter(({ node }) => !selected.some((other) => other.node !== node && other.node.contains(node)));
    const unique = [...new Map(topLevel.map(({ text }) => [text.toLowerCase(), text])).values()];
    return normalise(unique.join('\n\n'));
  }

  function fullPageFallback(root) {
    // This preserves independent sibling cards, tables, and definition lists that a single-container
    // strategy loses. Cleaning occurs before this stage.
    return textOf(root);
  }

  function extract() {
    const readability = tryMozillaReadability();
    if (readability) {
      debug('Extraction strategy: Mozilla Readability', { score: score(readability), length: readability.length });
      return { content: readability, strategy: 'readability', score: score(readability), detected: true };
    }
    debug('Readability unavailable or did not produce enough job content');
    const root = cleanClone();
    const semantic = collectSemanticSections(root);
    if (enough(semantic)) {
      debug('Extraction strategy: semantic sections', { score: score(semantic), length: semantic.length });
      return { content: semantic.slice(0, CONFIG.maxTextLength), strategy: 'semantic-sections', score: score(semantic), detected: true };
    }
    debug('Semantic sections were insufficient', { score: score(semantic), length: semantic.length });
    const page = fullPageFallback(root);
    const detected = enough(page);
    debug('Extraction strategy: full-page fallback', { score: score(page), length: page.length, detected });
    return { content: page.slice(0, CONFIG.maxTextLength), strategy: 'full-page', score: score(page), detected };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== 'GET_JOB_CONTENT') return;
    const result = extract();
    sendResponse({ url: location.href, hostname: location.hostname, title: document.title, ...result });
  });
})();
