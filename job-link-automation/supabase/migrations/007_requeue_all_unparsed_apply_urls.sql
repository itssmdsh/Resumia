-- One-time recovery for every application URL missing a parsed result.
-- Existing parsed_job_details rows are explicitly excluded and never reprocessed.
update public.job_apply_links as links
set
  parsing_status = 'pending',
  parse_error = 'One-time recovery: no parsed_job_details record exists',
  parse_failure_class = null,
  updated_at = now()
where links.extraction_status = 'success'
  and links.apply_url is not null
  and links.parsing_status <> 'processing'
  and not exists (
    select 1
    from public.parsed_job_details details
    where details.job_apply_link_id = links.id
  );
