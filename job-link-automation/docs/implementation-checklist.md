# Implementation checklist

- [x] Collect representative source URLs for Jobcode.
- [x] Confirm source URLs enter through Supabase.
- [x] Confirm redirects must be resolved.
- [x] Confirm 09:00 Asia/Kolkata as the daily run time.
- [x] Choose GitHub Actions as the runtime.
- [x] Create and protect Supabase server credentials.
- [x] Test the SQL migration in the target Supabase project.
- [x] Implement the Jobcode extractor with a conservative fallback.
- [x] Add URL validation, deduplication, and timeout behavior.
- [x] Add an idempotent Supabase upsert.
- [x] Add structured logs and failure records.
- [x] Add unit tests using sanitized HTML fixtures.
- [x] Add the daily scheduler.
- [x] Run an end-to-end test with the three sample records.
