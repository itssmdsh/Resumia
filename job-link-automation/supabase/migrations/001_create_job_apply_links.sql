create extension if not exists pgcrypto;

create table if not exists public.job_apply_links (
  id uuid primary key default gen_random_uuid(),
  source_url text not null unique,
  apply_url text,
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'success', 'failed')),
  error_message text,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_apply_links_extraction_status_idx
  on public.job_apply_links (extraction_status);

alter table public.job_apply_links enable row level security;

comment on table public.job_apply_links is
  'Source job pages and their extracted external application URLs.';
comment on column public.job_apply_links.source_url is
  'The third-party job-posting URL that was inspected.';
comment on column public.job_apply_links.apply_url is
  'The extracted application URL, optionally resolved through redirects.';
