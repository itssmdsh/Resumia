import { assertWorkerConfig, config } from './config.js';
import { toJobRecord } from './database/jobRecord.js';
import { createDatabase } from './database/supabase.js';
import { log } from './utils/logger.js';

try {
  assertWorkerConfig();
  const db = createDatabase(config.supabaseUrl, config.supabaseKey);
  const { data, error } = await db.from('parsed_job_details').select('id,job_apply_link_id,link,company,details').order('created_at').limit(10000);
  if (error) throw new Error(error.message);
  let repaired = 0;
  for (const row of data) {
    const record = toJobRecord({ id: row.job_apply_link_id, apply_url: row.link }, row.details || {});
    const { error: updateError } = await db.from('parsed_job_details').update({ ...record, job_apply_link_id: undefined }).eq('id', row.id);
    if (updateError) throw new Error(updateError.message);
    repaired += 1;
  }
  log('parsed_job_repair_finished', { repaired });
} catch (error) { log('parsed_job_repair_failed', { error: error.message }); process.exitCode = 1; }
