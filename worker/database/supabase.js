import { createClient } from '@supabase/supabase-js';
export function createDatabase(url, key) { return createClient(url, key, { auth: { persistSession: false } }); }
export async function pendingJobs(db, limit) {
  const { data, error } = await db.from('job_queue').select('id,url,source,status,attempts').eq('status', 'pending').order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(`Unable to fetch queue: ${error.message}`);
  return data;
}
export async function updateQueue(db, id, update) {
  const { error } = await db.from('job_queue').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`Unable to update queue ${id}: ${error.message}`);
}
export async function saveParsedJob(db, queue, job) {
  const record = {
    queue_id: queue.id, company: job.company?.name, title: job.job?.title,
    location: [job.location?.city, job.location?.state, job.location?.country].filter(Boolean).join(', ') || null,
    employment_type: job.job?.employmentType, experience: job.job?.experience?.display,
    education: job.education, salary: job.salary?.value || null, skills: job.skills,
    technologies: job.technologies, responsibilities: job.responsibilities, benefits: job.benefits,
    url: queue.url, job_json: job, parsed_at: new Date().toISOString(),
  };
  const { error } = await db.from('parsed_jobs').upsert(record, { onConflict: 'queue_id' });
  if (error) throw new Error(`Unable to save parsed job: ${error.message}`);
}
