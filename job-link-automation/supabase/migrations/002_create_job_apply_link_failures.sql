create table if not exists public.job_apply_link_failures (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  error_message text not null,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_apply_link_failures_last_failed_at_idx
  on public.job_apply_link_failures (last_failed_at);

alter table public.job_apply_link_failures enable row level security;

comment on table public.job_apply_link_failures is
  'Job source URLs that failed Apply-link extraction and will be retried.';

insert into public.job_apply_link_failures (
  source_url,
  error_message,
  first_failed_at,
  last_failed_at,
  created_at,
  updated_at
)
select
  source_url,
  coalesce(error_message, 'Unknown extraction failure'),
  coalesce(first_seen_at, created_at, now()),
  coalesce(last_checked_at, updated_at, now()),
  created_at,
  updated_at
from public.job_apply_links
where extraction_status = 'failed'
on conflict (source_url) do update set
  error_message = excluded.error_message,
  last_failed_at = excluded.last_failed_at,
  updated_at = excluded.updated_at;

delete from public.job_apply_links
where extraction_status = 'failed';
