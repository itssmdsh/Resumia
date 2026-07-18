# AI Job Parser

A Manifest V3 Chrome extension and Express API that turn job-posting pages into validated structured JSON. The browser extracts readable page content; only the backend calls OpenAI.

## Run the backend

1. Install Node.js 20+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`, then set either `OPENAI_API_KEY` or `OPENROUTER_API_KEY` (and its matching model variable).
4. Run `npm start`.

The API is available at `http://localhost:3000/api/extract` and has a health check at `/health`.

## Load the extension

1. Open `chrome://extensions` and enable Developer mode.
2. Choose **Load unpacked** and select the `extension` folder.
3. Visit a job posting, open the extension, and click **Extract**. `npm install` vendors Mozilla Readability into the extension automatically.
4. If needed, set the backend URL in the popup (it defaults to `http://localhost:3000`).

For production, serve the API over HTTPS and set `ALLOWED_EXTENSION_ORIGINS` to the installed extension origin, such as `chrome-extension://abcdefghijklmnopqrstuvwxyz`.

## Daily Supabase scraping worker

Run [`supabase/schema.sql`](C:/Users/hones/Documents/WebScraper/supabase/schema.sql) in Supabase SQL Editor, then add pending URLs to `job_queue`. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PARSER_API_URL` (a deployed HTTPS URL for this API) in your environment and run `npm run worker`.

The [`scrape.yml`](C:/Users/hones/Documents/WebScraper/.github/workflows/scrape.yml) workflow runs daily at 09:00 UTC, processes at most 50 pending URLs, uses HTTP extraction before Playwright, and persists the full parsed JSON in `parsed_jobs`. Add the same three values as GitHub Actions secrets before enabling the scheduled workflow.

## Output and forwarding

The popup can copy or download the result. Enter an optional teammate endpoint to forward the validated job JSON via `POST`; the extension attaches no credentials, so use a secure endpoint appropriate to your environment.
