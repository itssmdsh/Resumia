import OpenAI from 'openai';
import { jobSchema } from '../schemas/jobSchema.js';
import { systemPrompt, userPrompt } from '../prompts/parserPrompt.js';

function responseText(response) {
  return response.output_text || response.output?.flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text').map((part) => part.text).join('') || '';
}

function configuredKey(value) {
  return Boolean(value && value.trim() && value.trim() !== 'replace_me');
}

function maxOutputTokens() {
  const configured = Number(process.env.AI_MAX_TOKENS || 3000);
  return Number.isInteger(configured) && configured >= 256 && configured <= 16000 ? configured : 3000;
}

async function parseWithOpenRouter(payload, correction) {
  const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  const configuredModel = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-4.1-mini';
  const model = configuredModel.includes('/') || configuredModel.startsWith('~')
    ? configuredModel
    : `openai/${configuredModel}`;
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: openRouterKey,
    timeout: 45000,
    maxRetries: 1,
    defaultHeaders: { 'X-OpenRouter-Title': 'AI Job Parser' },
  });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${userPrompt(payload)}${correction}` },
    ],
    response_format: { type: 'json_object' },
    max_tokens: maxOutputTokens(),
  });
  return response.choices[0]?.message?.content || '';
}

async function parseWithOpenAI(payload, correction) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000, maxRetries: 1 });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `${userPrompt(payload)}${correction}` }],
    text: { format: { type: 'json_object' } },
    max_output_tokens: maxOutputTokens(),
  });
  return responseText(response);
}

export async function parseJob(payload) {
  // Accept a misplaced OpenRouter key for a painless migration from the original OpenAI-only setup.
  const useOpenRouter = configuredKey(process.env.OPENROUTER_API_KEY)
    || (configuredKey(process.env.OPENAI_API_KEY) && process.env.OPENAI_API_KEY.trim().startsWith('sk-or-'));
  if (!useOpenRouter && !configuredKey(process.env.OPENAI_API_KEY)) {
    throw new Error('Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env');
  }
  let correction = '';
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const content = useOpenRouter
      ? await parseWithOpenRouter(payload, correction)
      : await parseWithOpenAI(payload, correction);
    try {
      return jobSchema.parse(JSON.parse(content));
    } catch (error) {
      lastError = error;
      correction = '\n\nYour previous response was invalid. Return only a valid JSON object that strictly follows the requested schema.';
    }
  }
  throw new Error(`Model returned invalid job JSON: ${lastError?.message || 'unknown error'}`);
}
