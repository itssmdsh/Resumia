const NOISE = /cookie|consent|advert|sidebar|newsletter|breadcrumb|social|recommend|related|similar|recent search|login|sign up|register|chat|feedback|navigation|footer/i;
const SIGNALS = [
  [/responsibilit/i, 2], [/(requirements?|qualifications?)/i, 2], [/(skills?|competenc)/i, 2],
  [/(experience|education)/i, 2], [/(location|salary|benefits?)/i, 2], [/(apply|employment type|department)/i, 1],
];
export function cleanText(value) { return String(value || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim(); }
export function confidence(text) {
  let result = text.length > 1000 ? 3 : text.length >= 250 ? 1 : 0;
  for (const [pattern, points] of SIGNALS) if (pattern.test(text)) result += points;
  return result;
}
export { NOISE };
