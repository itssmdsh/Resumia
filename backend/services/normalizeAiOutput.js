function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function text(value) { return value === undefined || value === null || value === '' ? null : String(value).trim() || null; }
function confidence(value) { const number = Number(value); return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null; }
function boolean(value) { return typeof value === 'boolean' ? value : null; }
function list(value) { return Array.isArray(value) ? value : value ? [value] : []; }
function importance(value) {
  const normalized = text(value)?.toLowerCase();
  if (/required|mandatory|must/.test(normalized || '')) return 'Required';
  if (/preferred|desired|nice.to.have/.test(normalized || '')) return 'Preferred';
  if (/optional/.test(normalized || '')) return 'Optional';
  return null;
}
function namedItems(value, category) {
  return list(value).map((item) => {
    const entry = object(item);
    const name = text(entry.name || entry.skill || entry.language || entry.technology || entry.tool || entry.framework || item);
    return name ? { name, category: text(entry.category) || category, importance: importance(entry.importance || entry.priority), confidence: confidence(entry.confidence) } : null;
  }).filter(Boolean);
}
function textItems(value) {
  return list(value).map((item) => {
    const entry = object(item); const itemText = text(entry.text || entry.name || entry.description || entry.value || item);
    return itemText ? { text: itemText, confidence: confidence(entry.confidence) } : null;
  }).filter(Boolean);
}
function experience(value) {
  const entry = object(value); const display = text(entry.display || entry.value || value);
  const years = display?.match(/(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*years?/i);
  return { display, minYears: Number.isFinite(Number(entry.minYears)) ? Number(entry.minYears) : years ? Number(years[1]) : null, maxYears: Number.isFinite(Number(entry.maxYears)) ? Number(entry.maxYears) : years ? Number(years[2] || years[1]) : null, confidence: confidence(entry.confidence) };
}

export function normalizeAiOutput(raw, payload) {
  const source = object(raw); const company = object(source.company); const job = object(source.job); const location = object(source.location); const metadata = object(source.metadata);
  const salary = source.salary === null || source.salary === undefined ? null : object(source.salary);
  return {
    company: { name: text(company.name || source.company), confidence: confidence(company.confidence) },
    job: { title: text(job.title || source.jobTitle), department: text(job.department || source.department), employmentType: text(job.employmentType || source.employmentType), experience: experience(job.experience || source.experience) },
    location: { city: text(location.city || source.location), state: text(location.state), country: text(location.country || source.country), remote: boolean(location.remote ?? source.remote), hybrid: boolean(location.hybrid ?? source.hybrid), onsite: boolean(location.onsite), relocation: boolean(location.relocation), travelRequirement: text(location.travelRequirement), confidence: confidence(location.confidence) },
    education: textItems(source.education), certifications: textItems(source.certifications), skills: namedItems(source.skills, 'Skill'), technologies: namedItems(source.technologies, 'Technology'), tools: namedItems(source.tools, 'Tool'), frameworks: namedItems(source.frameworks, 'Framework'), databases: namedItems(source.databases, 'Database'), cloud: namedItems(source.cloud, 'Cloud'), softSkills: namedItems(source.softSkills, 'Soft Skill'), responsibilities: textItems(source.responsibilities), qualifications: textItems(source.qualifications), benefits: textItems(source.benefits), languages: namedItems(source.languages, 'Language'),
    salary: salary ? { value: text(salary.value || source.salary), currency: text(salary.currency || source.currency), confidence: confidence(salary.confidence) } : null,
    metadata: { url: text(metadata.url || source.url || payload.url), source: text(metadata.source || source.source || payload.hostname), postedDate: text(metadata.postedDate || source.postedDate), deadline: text(metadata.deadline || source.deadline), confidence: confidence(metadata.confidence) },
  };
}
