import { createClient } from '@supabase/supabase-js';
import { companyFromUrl, toJobRecord } from './jobRecord.js';
export function createDatabase(url, key) { return createClient(url, key, { auth: { persistSession: false } }); }
export async function pendingJobs(db, limit) {
  const { data, error } = await db.from('job_apply_links')
    .select('id,source_url,apply_url,parse_attempts,parsed_job_details!left(id)')
    .eq('extraction_status', 'success').not('apply_url', 'is', null)
    .eq('parsing_status', 'pending').is('parsed_job_details.id', null)
    .order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(`Unable to fetch application links: ${error.message}`);
  return data;
}
export async function recoverStaleProcessing(db) {
  const { data, error } = await db.rpc('recover_stale_job_parsing');
  if (error) throw new Error(`Unable to recover stale processing links: ${error.message}`);
  return data || 0;
}
export async function claimJob(db, id) {
  const { data, error } = await db.rpc('claim_job_apply_link', { p_link_id: id });
  if (error) throw new Error(`Unable to claim application link ${id}: ${error.message}`);
  return data?.[0] || null;
}
export async function updateQueue(db, id, update) {
  const { error } = await db.from('job_apply_links').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`Unable to update application link ${id}: ${error.message}`);
}
export async function startAttempt(db, queue) {
  const { data, error } = await db.from('job_parsing_attempts').insert({ job_apply_link_id: queue.id, attempt_number: queue.parse_attempts, url: queue.apply_url, company: companyFromUrl(queue.apply_url, queue.source_url), outcome: 'processing' }).select('id').single();
  if (error) throw new Error(`Unable to record parsing attempt: ${error.message}`);
  return data.id;
}
export async function finishAttempt(db, id, update) {
  const { error } = await db.from('job_parsing_attempts').update({ ...update, ended_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(`Unable to finalize parsing attempt: ${error.message}`);
}
export async function lifecycleSummary(db) {
  const { data, error } = await db.rpc('job_parsing_lifecycle_summary');
  if (error) throw new Error(`Unable to get lifecycle summary: ${error.message}`);
  return Object.fromEntries((data || []).map((row) => [row.lifecycle, Number(row.total)]));
}
export async function markDuplicateLinksComplete(db, queue) {
  const { error } = await db.from('job_apply_links')
    .update({ parsing_status: 'skipped', parse_error: `Duplicate of ${queue.id}`, parse_failure_class: 'duplicate', parsed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('apply_url', queue.apply_url).neq('id', queue.id).eq('parsing_status', 'pending');
  if (error) throw new Error(`Unable to mark duplicate application links: ${error.message}`);
}
export async function saveParsedJob(db, queue, job) {
  const record = toJobRecord(queue, job);
  const { error } = await db.from('parsed_job_details').upsert(record, { onConflict: 'job_apply_link_id' });
  if (error) throw new Error(`Unable to save parsed job: ${error.message}`);
}
