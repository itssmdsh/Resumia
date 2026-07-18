import OpenAI from 'openai';
import { jobSchema } from '../schemas/jobSchema.js';
import { normalizeAiOutput } from './normalizeAiOutput.js';
import { systemPrompt, userPrompt } from '../prompts/parserPrompt.js';

function responseText(response) { return response.output_text || response.output?.flatMap((item) => item.content || []).filter((part) => part.type === 'output_text').map((part) => part.text).join('') || ''; }
function configuredKey(value) { return Boolean(value && value.trim() && value.trim() !== 'replace_me'); }
function maxOutputTokens() { const configured = Number(process.env.AI_MAX_TOKENS || 1200); return Number.isInteger(configured) && configured >= 256 && configured <= 16000 ? configured : 1200; }
function openRouterKeys() {
  const keyList = (process.env.OPENROUTER_API_KEYS || '').split(/[\r\n,]+/).map((key) => key.trim());
  const values = [process.env.OPENROUTER_API_KEY, ...keyList, ...Array.from({ length: 20 }, (_, index) => process.env[`OPENROUTER_API_KEY_${index + 1}`]), process.env.OPENAI_API_KEY?.startsWith('sk-or-') ? process.env.OPENAI_API_KEY : null];
  return [...new Set(values.filter(configuredKey))];
}
function modelName() { const configured = process.env.OPENROUTER_MODEL || process.env.OPENAI_MODEL || 'openai/gpt-4.1-mini'; return configured.includes('/') || configured.startsWith('~') ? configured : `openai/${configured}`; }
function shouldRotate(error) { return [401, 402, 429].includes(Number(error?.status)); }
function parseJson(content) {
  const cleaned = String(content || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const candidate = cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1).replace(/,\s*([}\]])/g, '$1');
  if (!candidate) throw new Error('Model returned no JSON object');
  return JSON.parse(candidate);
}
async function parseWithOpenRouter(payload, correction, apiKey) {
  const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey, timeout: 45000, maxRetries: 1, defaultHeaders: { 'X-OpenRouter-Title': 'AI Job Parser' } });
  const response = await client.chat.completions.create({ model: modelName(), messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `${userPrompt(payload)}${correction}` }], response_format: { type: 'json_object' }, max_tokens: maxOutputTokens() });
  return response.choices[0]?.message?.content || '';
}
async function completeWithOpenRouter(payload, correction, keys) {
  let lastError;
  for (const key of keys) {
    try { return await parseWithOpenRouter(payload, correction, key); }
    catch (error) { lastError = error; if (!shouldRotate(error)) throw error; }
  }
  throw lastError || new Error('No OpenRouter key is configured');
}
async function parseWithOpenAI(payload, correction) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45000, maxRetries: 1 });
  const response = await client.responses.create({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', input: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `${userPrompt(payload)}${correction}` }], text: { format: { type: 'json_object' } }, max_output_tokens: maxOutputTokens() });
  return responseText(response);
}

export async function parseJob(payload) {
  const keys = openRouterKeys();
  if (!keys.length && !configuredKey(process.env.OPENAI_API_KEY)) throw new Error('Set an OpenRouter or OpenAI API key');
  let correction = ''; let lastError; let lastRawResponse = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const content = keys.length ? await completeWithOpenRouter(payload, correction, keys) : await parseWithOpenAI(payload, correction);
      lastRawResponse = content;
      return jobSchema.parse(normalizeAiOutput(parseJson(content), payload));
    } catch (error) {
      lastError = error;
      correction = '\n\nYour prior output could not be parsed. Return one complete JSON object only; include every required top-level field and use [] or null for unavailable fields.';
    }
  }
  const error = new Error(`Model returned invalid job JSON: ${lastError?.message || 'unknown error'}`);
  error.rawAiResponse = lastRawResponse;
  error.cause = lastError;
  throw error;
}
