const $ = (selector) => document.querySelector(selector);
let job;

function setStatus(text, kind = '') { $('#status').textContent = text; $('#status').className = kind; }
function toggleActions(enabled) { ['#copy', '#download', '#send'].forEach((id) => { $(id).disabled = !enabled; }); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])); }
function render(data) {
  const experience = data.job?.experience?.display || [data.job?.experience?.minYears, data.job?.experience?.maxYears].filter((value) => value !== null && value !== undefined).join('–') || null;
  const location = [data.location?.city, data.location?.state, data.location?.country].filter(Boolean).join(', ') || null;
  const fields = [['Company', data.company?.name], ['Role', data.job?.title], ['Experience', experience], ['Location', location], ['Employment', data.job?.employmentType]];
  $('#result').hidden = false;
  const topItems = [...(data.skills || []), ...(data.technologies || [])].slice(0, 18);
  $('#result').innerHTML = `${fields.filter(([, value]) => value).map(([label, value]) => `<div class="field"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}<h2>Top skills</h2><div class="chips">${topItems.map((item) => `<i title="${escapeHtml(item.importance || 'Unranked')} · confidence ${escapeHtml(item.confidence ?? '—')}%">${escapeHtml(item.name)}</i>`).join('') || '<em>None listed</em>'}</div>`;
}

async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }
$('#extract').addEventListener('click', async () => {
  try {
    setStatus('Reading job description…'); $('#extract').disabled = true;
    const tab = await activeTab();
    if (!tab.id || !/^https?:/.test(tab.url || '')) throw new Error('Open a regular job-posting webpage first');
    const page = await chrome.tabs.sendMessage(tab.id, { type: 'GET_JOB_CONTENT' });
    if (!page?.content || page.content.length < 80 || !page.detected) {
      throw new Error('No job description was confidently detected on this page');
    }
    setStatus('Extracting structured job data…');
    const result = await chrome.runtime.sendMessage({ type: 'EXTRACT_JOB', payload: page });
    if (!result.success) throw new Error(result.error || 'Extraction failed');
    job = result.job; render(job); toggleActions(true); setStatus('Extraction complete.', 'success');
  } catch (error) { setStatus(error.message, 'error'); }
  finally { $('#extract').disabled = false; }
});
$('#copy').addEventListener('click', async () => { await navigator.clipboard.writeText(JSON.stringify(job, null, 2)); setStatus('JSON copied.', 'success'); });
$('#download').addEventListener('click', () => { const blob = new Blob([JSON.stringify(job, null, 2)], { type: 'application/json' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'job.json' }); a.click(); URL.revokeObjectURL(a.href); });
$('#send').addEventListener('click', async () => { setStatus('Sending…'); const result = await chrome.runtime.sendMessage({ type: 'FORWARD_JOB', job }); setStatus(result.success ? 'Sent successfully.' : result.error, result.success ? 'success' : 'error'); });
$('#save').addEventListener('click', async () => { await chrome.storage.sync.set({ backendUrl: $('#backendUrl').value.trim() || 'http://localhost:3000', teammateUrl: $('#teammateUrl').value.trim() }); setStatus('Settings saved.', 'success'); });
(async () => { const data = await chrome.storage.sync.get({ backendUrl: 'http://localhost:3000', teammateUrl: '' }); $('#backendUrl').value = data.backendUrl; $('#teammateUrl').value = data.teammateUrl; })();
