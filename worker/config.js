import 'dotenv/config';

function integer(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return value;
}

export const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY,
  parserApiUrl: (process.env.PARSER_API_URL || process.env.OPENAI_ENDPOINT || '').replace(/\/$/, ''),
  batchLimit: integer('WORKER_BATCH_LIMIT', 50, 1, 100),
  concurrency: integer('WORKER_CONCURRENCY', 3, 1, 5),
  httpThreshold: integer('HTTP_CONFIDENCE_THRESHOLD', 7, 1, 20),
};

export function assertWorkerConfig() {
  for (const [name, value] of Object.entries({ SUPABASE_URL: config.supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: config.supabaseKey, PARSER_API_URL: config.parserApiUrl })) {
    if (!value) throw new Error(`${name} is required for the worker`);
  }
}
