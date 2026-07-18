alter table public.job_apply_links drop constraint if exists job_apply_links_parsing_status_check;
alter table public.job_apply_links add constraint job_apply_links_parsing_status_check
  check (parsing_status in ('pending', 'processing', 'completed', 'failed', 'expired', 'skipped'));
alter table public.job_apply_links
  add column if not exists parse_failure_class text,
  add column if not exists parse_method text;

create table if not exists public.job_parsing_attempts (
  id uuid primary key default gen_random_uuid(),
  job_apply_link_id uuid not null references public.job_apply_links(id) on delete cascade,
  attempt_number integer not null,
  url text not null,
  company text,
  outcome text not null check (outcome in ('processing', 'completed', 'failed', 'expired', 'skipped')),
  failure_class text,
  extraction_method text,
  extraction_score integer,
  http_status integer,
  raw_content text,
  ai_raw_response text,
  error_message text,
  stack_trace text,
  retry_count integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms integer
);
create index if not exists job_parsing_attempts_link_idx on public.job_parsing_attempts(job_apply_link_id, started_at desc);
alter table public.job_parsing_attempts enable row level security;

create or replace function public.claim_job_apply_link(p_link_id uuid)
returns setof public.job_apply_links
language sql
as $$
  update public.job_apply_links
  set parsing_status = 'processing', parse_attempts = parse_attempts + 1,
      parse_error = null, parse_failure_class = null, updated_at = now()
  where id = p_link_id and parsing_status = 'pending'
  returning *;
$$;

create or replace function public.recover_stale_job_parsing(p_age interval default interval '90 minutes')
returns integer
language plpgsql
as $$
declare recovered integer;
begin
  update public.job_apply_links
  set parsing_status = 'pending', parse_error = 'Recovered after stale processing lease', updated_at = now()
  where parsing_status = 'processing' and updated_at < now() - p_age;
  get diagnostics recovered = row_count;
  return recovered;
end;
$$;

create or replace function public.job_parsing_lifecycle_summary()
returns table (lifecycle text, total bigint)
language sql
as $$
  select case
    when details.id is not null then 'completed'
    when links.extraction_status = 'failed' then 'failed'
    when links.extraction_status = 'success' and links.apply_url is null then 'skipped'
    else links.parsing_status
  end as lifecycle, count(*)
  from public.job_apply_links links
  left join public.parsed_job_details details on details.job_apply_link_id = links.id
  group by 1;
$$;
