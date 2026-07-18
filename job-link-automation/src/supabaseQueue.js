function headers(secretKey, extra = {}) {
  return {
    apikey: secretKey,
    authorization: `Bearer ${secretKey}`,
    ...extra,
  };
}

async function supabaseRequest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: headers(config.supabaseSecretKey, options.headers),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase returned HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  return response;
}

export async function getPendingJobs(config) {
  const query = new URLSearchParams({
    select: 'id,source_url',
    extraction_status: 'in.(pending,failed)',
    order: 'created_at.asc',
    limit: String(config.batchSize),
  });
  const response = await supabaseRequest(config, `job_apply_links?${query}`);
  return response.json();
}

export async function updateJob(config, id, values) {
  await supabaseRequest(config, `job_apply_links?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({
      ...values,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function enqueueJobs(config, sourceUrls) {
  const rows = sourceUrls.map((sourceUrl) => ({
    source_url: sourceUrl,
    apply_url: null,
    extraction_status: 'pending',
    error_message: null,
  }));

  await supabaseRequest(config, 'job_apply_links?on_conflict=source_url', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
}

export async function enqueueNewJobs(config, sourceUrls) {
  if (!sourceUrls.length) return;

  await supabaseRequest(config, 'job_apply_links?on_conflict=source_url', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(sourceUrls.map((sourceUrl) => ({ source_url: sourceUrl }))),
  });
}
