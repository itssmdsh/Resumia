const aliases = new Map([
  ['js', 'JavaScript'], ['javascript', 'JavaScript'], ['ts', 'TypeScript'], ['typescript', 'TypeScript'],
  ['reactjs', 'React'], ['react.js', 'React'], ['node', 'Node.js'], ['nodejs', 'Node.js'], ['node.js', 'Node.js'],
  ['springboot', 'Spring Boot'], ['postgres', 'PostgreSQL'], ['postgresql', 'PostgreSQL'], ['k8s', 'Kubernetes'],
]);
const order = { Required: 0, Preferred: 1, Optional: 2, null: 3 };
function normalizeName(name) { const clean = name.replace(/\s+/g, ' ').trim(); return aliases.get(clean.toLowerCase()) || clean; }
function normalizeList(items) {
  const merged = new Map();
  for (const item of items) {
    const name = normalizeName(item.name); const key = name.toLowerCase(); const previous = merged.get(key);
    if (!previous) merged.set(key, { ...item, name });
    else merged.set(key, { ...previous, confidence: Math.max(previous.confidence || 0, item.confidence || 0), importance: order[item.importance] < order[previous.importance] ? item.importance : previous.importance });
  }
  return [...merged.values()].sort((a, b) => order[a.importance] - order[b.importance] || (b.confidence || 0) - (a.confidence || 0));
}
export function normalizeSkills(job) {
  return { ...job, skills: normalizeList(job.skills), technologies: normalizeList(job.technologies), tools: normalizeList(job.tools), frameworks: normalizeList(job.frameworks), databases: normalizeList(job.databases), cloud: normalizeList(job.cloud), softSkills: normalizeList(job.softSkills), languages: normalizeList(job.languages) };
}
