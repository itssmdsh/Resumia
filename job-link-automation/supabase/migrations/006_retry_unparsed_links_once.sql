-- A link may receive one additional parsing attempt when it has no parsed result.
-- This recovers rows produced before the audit lifecycle was added without retrying forever.
create or replace function public.requeue_retryable_unparsed_links(p_limit integer default 500)
returns integer
language plpgsql
as $$
declare requeued integer;
begin
  with candidates as (
    select links.id
    from public.job_apply_links links
    left join public.parsed_job_details details on details.job_apply_link_id = links.id
    where links.extraction_status = 'success'
      and links.apply_url is not null
      and details.id is null
      and links.parsing_status in ('failed', 'expired', 'skipped')
      and links.parse_attempts < 2
    order by links.updated_at asc
    limit greatest(1, least(p_limit, 500))
  )
  update public.job_apply_links links
  set parsing_status = 'pending', updated_at = now()
  from candidates
  where links.id = candidates.id;
  get diagnostics requeued = row_count;
  return requeued;
end;
$$;
