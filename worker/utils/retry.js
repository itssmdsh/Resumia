export async function retry(operation, attempts = 2) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await operation(attempt); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 750 * attempt)); }
  }
  throw error;
}
