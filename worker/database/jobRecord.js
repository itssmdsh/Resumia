const ACRONYMS = new Map([['cgi', 'CGI'], ['ibm', 'IBM'], ['hpe', 'HPE'], ['ey', 'EY'], ['exl', 'EXL'], ['tcs', 'TCS'], ['sap', 'SAP'], ['aws', 'AWS'], ['hp', 'HP']]);
function valueText(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ') || null;
    return valueText(value.display || value.text || value.name || value.value || value.title || value.description);
  }
  const result = String(value).trim();
  return result && result !== '[object Object]' ? result : null;
}
function sanitizeDetails(value) {
  if (value === '[object Object]') return null;
  if (Array.isArray(value)) return value.map(sanitizeDetails);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeDetails(item)]));
  return value;
}
function label(value) { const lowered = value.toLowerCase(); return ACRONYMS.get(lowered) || lowered.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
export function companyFromUrl(...urls) {
  for (const url of urls) {
    try {
      const parts = new URL(url).hostname.replace(/^www\./, '').split('.');
      const candidate = parts.find((part) => !/^(jobs?|careers?|apply|job-boards|wd\d+|myworkdayjobs|oraclecloud|greenhouse|lever|smartrecruiters|eu|com|co|in|global|external|en|us|india)$/i.test(part));
      if (candidate && candidate.length > 1) return label(candidate);
    } catch { /* Ignore malformed source URLs. */ }
  }
  return null;
}
function commaSeparated(items) { return [...new Set((items || []).map((item) => valueText(item?.name || item?.text || item)).filter(Boolean))].join(', ') || null; }
export function toJobRecord(queue, job) {
  const details = sanitizeDetails(job || {});
  const company = valueText(details.company?.name) || companyFromUrl(queue.apply_url, queue.source_url);
  return {
    job_apply_link_id: queue.id, link: queue.apply_url, company, title: valueText(details.job?.title),
    location: [valueText(details.location?.city), valueText(details.location?.state), valueText(details.location?.country)].filter(Boolean).join(', ') || null,
    employment_type: valueText(details.job?.employmentType), experience: valueText(details.job?.experience?.display), education: commaSeparated(details.education), salary: valueText(details.salary?.value), skills: commaSeparated(details.skills), technologies: commaSeparated(details.technologies), responsibilities: commaSeparated(details.responsibilities), benefits: commaSeparated(details.benefits), details, parsed_at: new Date().toISOString(),
  };
}
