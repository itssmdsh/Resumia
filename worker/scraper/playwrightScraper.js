import { chromium } from 'playwright';
import { cleanText, confidence } from './cleaner.js';

export class PlaywrightScraper {
  browser;
  async extract(url) {
    this.browser ||= await chromium.launch({ headless: true });
    const page = await this.browser.newPage({ userAgent: 'AI-Job-Parser-Worker/1.0 (+https://github.com/itssmdsh/Resumia)', viewport: { width: 1440, height: 1200 } });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.locator('button, a, [role="button"]').evaluateAll((nodes) => nodes.filter((node) => /read more|show more|view more|expand/i.test(node.textContent || '')).slice(0, 10).forEach((node) => node.click())).catch(() => {});
      await page.waitForTimeout(700);
      const content = cleanText(await page.locator('body').innerText());
      return { method: 'playwright', content, score: confidence(content), accepted: content.length >= 80 };
    } finally { await page.close(); }
  }
  async close() { await this.browser?.close(); this.browser = undefined; }
}
