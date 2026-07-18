# Job Apply-Link Automation

This folder is reserved for the automated workflow that:

1. discovers third-party job-posting URLs from configured websites, YouTube
   channels, and public Telegram channels;
2. opens each job page and extracts the final **Apply** URL only;
3. stores the result in Supabase;
4. runs automatically every day at 09:00 Asia/Kolkata.

It is separate from the existing browser extension and API.

## Information needed before implementation

Please provide:

- **Example job links:** 3-5 real examples from every website that must be supported.
- **Input method:** confirmed as pending rows in the Supabase table.
- **Apply-link meaning:** confirmed as the final employer/ATS URL after redirects.
- **Supabase project URL:** for example, `https://xxxxx.supabase.co`.
- **Supabase server key:** preferably a dedicated `sb_secret_...` key. Do not commit it or paste it into source code.
- **Schedule and timezone:** confirmed as `09:00` in `Asia/Kolkata`.
- **Hosting choice:** GitHub Actions, Supabase Edge Functions/Cron, or an always-on server. A local computer cannot run the schedule while it is switched off.
- **Site constraints:** whether any target pages require login, CAPTCHA, JavaScript rendering, or cookie consent.

Do not send secrets until the storage/deployment method is chosen. They should be added as environment secrets.

## Proposed data flow

```text
source job URL -> fetch/render page -> find Apply link -> resolve redirect
               -> validate URL -> upsert into Supabase -> record run result
```

The unique `source_url` prevents the same job from being stored repeatedly. The
initial schema includes operational fields, while business fields can be added
later through SQL migrations.

## Planned environment variables

Copy `.env.example` to `.env` only inside the deployment environment.

## Database setup

Run [`supabase/migrations/001_create_job_apply_links.sql`](supabase/migrations/001_create_job_apply_links.sql)
in the Supabase SQL editor. It creates the initial table but does not expose it
publicly.

## Implementation notes

- Simple HTML sites can be handled with normal HTTP requests.
- JavaScript-only sites may need Playwright or a site-specific API.
- Each supported site should have its own extractor, plus a conservative generic
  fallback.
- Failures should be recorded without deleting a previously discovered apply URL.
- The scheduler should invoke the idempotent `npm start` command once per day.

## Automatic discovery and queue usage

Each run first scrapes `DISCOVERY_SOURCES`. The default GitHub workflow sources
are the three configured YouTube channels, Jobcode, and the three configured
public Telegram channels. Newly discovered URLs are inserted into
`public.job_apply_links` as `pending`; existing rows are left unchanged so
successful jobs are not processed repeatedly. The run then extracts and resolves
the final Apply URL and updates each new row to `success` or `failed`. Failed rows
are retried on later daily runs so temporary network or source-site errors can
recover automatically.

`DISCOVERY_SOURCES` accepts comma-separated or newline-separated website URLs,
YouTube channel URLs/handles, and public Telegram channel URLs. You can override
the default in GitHub under **Settings → Secrets and variables → Actions →
Variables**. `DISCOVERY_TIMEFRAME` defaults to `all`, so every item currently
available through YouTube RSS and Telegram's public preview is scanned. Generic
website discovery scans the configured page on every run.

Links can still be added manually by inserting only `source_url`, or with:

```sh
npm run enqueue -- https://jobcode.in/example-job/
```

## Run locally

From this folder:

```sh
npm install
npm test
npm start
```

This requires Node.js 20.6 or newer.

## Daily schedule

The repository workflow `.github/workflows/job-link-automation.yml` runs every
day at 03:30 UTC, which is 09:00 Asia/Kolkata. Add `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` as GitHub repository Actions secrets before running it.
The workflow can also be started manually from the GitHub Actions page. It
processes up to 500 pending or retryable links per run using five concurrent
workers.
