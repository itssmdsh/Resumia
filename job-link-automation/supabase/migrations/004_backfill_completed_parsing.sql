-- Preserve already-parsed links when moving to the application-link worker.
-- The unique relation plus the worker's left-join filter prevents duplicate parsing.
update public.job_apply_links as links
set
  parsing_status = 'completed',
  parsed_at = coalesce(links.parsed_at, details.parsed_at),
  updated_at = now()
from public.parsed_job_details as details
where details.job_apply_link_id = links.id
  and links.parsing_status <> 'completed';
