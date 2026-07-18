import { createClient } from '@supabase/supabase-js';
export function createDatabase(url, key) { return createClient(url, key, { auth: { persistSession: false } }); }
export async function pendingJobs(db, limit) {
  const { data, error } = await db.from('job_apply_links')
    .select('id,source_url,apply_url,parse_attempts')
    .eq('extraction_status', 'success').not('apply_url', 'is', null)
    .eq('parsing_status', 'pending').order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(`Unable to fetch application links: ${error.message}`);
  return data;
}
export async function updateQueue(db, id, update) {
  const { error } = await db.from('job_apply_links').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`Unable to update application link ${id}: ${error.message}`);
}
function commaSeparated(items) {
  return [...new Set((items || []).map((item) => item?.name || item?.text).filter(Boolean))].join(', ') || null;
}
export async function saveParsedJob(db, queue, job) {
  const record = {
    job_apply_link_id: queue.id, link: queue.apply_url, company: job.company?.name, title: job.job?.title,
    location: [job.location?.city, job.location?.state, job.location?.country].filter(Boolean).join(', ') || null,
    employment_type: job.job?.employmentType, experience: job.job?.experience?.display,
    education: commaSeparated(job.education), salary: job.salary?.value || null, skills: commaSeparated(job.skills),
    technologies: commaSeparated(job.technologies), responsibilities: commaSeparated(job.responsibilities), benefits: commaSeparated(job.benefits),
    details: job, parsed_at: new Date().toISOString(),
  };
  const { error } = await db.from('parsed_job_details').upsert(record, { onConflict: 'job_apply_link_id' });
  if (error) throw new Error(`Unable to save parsed job: ${error.message}`);
}
