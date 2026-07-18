const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value.replace(/\/+$/, '');
};

export function getConfig() {
  return {
    supabaseUrl: required('SUPABASE_URL'),
    supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
    batchSize: Math.max(1, Math.min(Number(process.env.BATCH_SIZE || 50), 500)),
    requestTimeoutMs: Math.max(1_000, Number(process.env.REQUEST_TIMEOUT_MS || 20_000)),
  };
}
