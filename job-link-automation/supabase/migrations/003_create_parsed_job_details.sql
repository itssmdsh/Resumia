alter table public.job_apply_links
  add column if not exists parsing_status text not null default 'pending'
    check (parsing_status in ('pending', 'processing', 'completed', 'failed')),
  add column if not exists parse_attempts integer not null default 0,
  add column if not exists parse_error text,
  add column if not exists parsed_at timestamptz;

create index if not exists job_apply_links_ready_to_parse_idx
  on public.job_apply_links (parsing_status, created_at)
  where extraction_status = 'success' and apply_url is not null;

create table if not exists public.parsed_job_details (
  id uuid primary key default gen_random_uuid(),
  job_apply_link_id uuid not null unique references public.job_apply_links(id) on delete cascade,
  link text not null,
  company text,
  title text,
  location text,
  employment_type text,
  experience text,
  education text,
  salary text,
  skills text,
  technologies text,
  responsibilities text,
  benefits text,
  details jsonb not null,
  parsed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parsed_job_details enable row level security;

comment on table public.parsed_job_details is
  'AI-parsed job details. Skills, technologies, responsibilities, and benefits are stored as comma-separated text for easy display; details retains the complete structured JSON.';
