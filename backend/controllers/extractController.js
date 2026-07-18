import { parseJob } from '../services/openaiService.js';
import { normalizeSkills } from '../services/normalizeSkills.js';

export async function extractJob(req, res) {
  try {
    const job = normalizeSkills(await parseJob(req.body));
    res.json({ success: true, job });
  } catch (error) {
    console.error('Extraction failed:', error.message);
    const status = /configured/.test(error.message) ? 503 : 502;
    const body = { success: false, error: status === 503 ? 'AI service is not configured' : 'Unable to parse this job posting' };
    if (process.env.PARSER_AUDIT_MODE === 'true') body.debug = { rawAiResponse: error.rawAiResponse || null, providerStatus: error.cause?.status || error.status || null };
    res.status(status).json(body);
  }
}
