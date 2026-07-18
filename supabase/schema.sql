create table if not exists public.job_queue (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  source text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_queue_pending_idx on public.job_queue (status, created_at);

create table if not exists public.parsed_jobs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null unique references public.job_queue(id) on delete cascade,
  company text, title text, location text, employment_type text, experience text,
  education jsonb not null default '[]'::jsonb, salary text, skills jsonb not null default '[]'::jsonb,
  technologies jsonb not null default '[]'::jsonb, responsibilities jsonb not null default '[]'::jsonb,
  benefits jsonb not null default '[]'::jsonb, url text not null, job_json jsonb not null,
  parsed_at timestamptz not null default now()
);
