const DEFAULT_BACKEND = 'http://localhost:3000';

async function settings() {
  return chrome.storage.sync.get({ backendUrl: DEFAULT_BACKEND, teammateUrl: '' });
}

async function fetchWithRetry(url, options, attempts = 2) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 50000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${response.status})`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
    }
  }
  throw lastError;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_JOB') {
    (async () => {
      try {
        const { backendUrl } = await settings();
        const response = await fetchWithRetry(`${backendUrl.replace(/\/$/, '')}/api/extract`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message.payload),
        });
        sendResponse(await response.json());
      } catch (error) { sendResponse({ success: false, error: error.name === 'AbortError' ? 'Backend request timed out' : error.message }); }
    })();
    return true;
  }
  if (message.type === 'FORWARD_JOB') {
    (async () => {
      try {
        const { teammateUrl } = await settings();
        if (!teammateUrl) throw new Error('Set a teammate endpoint first');
        await fetchWithRetry(teammateUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message.job) });
        sendResponse({ success: true });
      } catch (error) { sendResponse({ success: false, error: error.message }); }
    })();
    return true;
  }
});

