import { z } from 'zod';

const requestSchema = z.object({
  url: z.string().url().max(2048),
  hostname: z.string().min(1).max(253),
  title: z.string().max(500).optional().default(''),
  content: z.string().min(100, 'Job description is too short').max(60000),
});

export function validateExtractionRequest(req, res, next) {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'Invalid extraction request', details: parsed.error.flatten() });
  }
  req.body = parsed.data;
  return next();
}

