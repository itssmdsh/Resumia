import assert from 'node:assert/strict';
import test from 'node:test';
import { extractApplyUrl, resolveRedirects } from '../src/extractApplyUrl.js';

test('extracts Jobcode Apply Link and resolves HTML entities', () => {
  const html = `
    <a href="https://jobcode.in/freshers">Freshers</a>
    <a class="button" href="https://company.example/jobs/123?a=1&amp;b=2">Apply Link</a>
    <a href="https://facebook.com/share">Share</a>
  `;

  assert.equal(
    extractApplyUrl(html, 'https://jobcode.in/example-job/'),
    'https://company.example/jobs/123?a=1&b=2',
  );
});

test('does not confuse How to Apply with the actual button', () => {
  const html = `
    <a href="/how-to-apply">How to Apply</a>
    <a href="https://ats.example/careers/job/42">Apply Now</a>
  `;

  assert.equal(
    extractApplyUrl(html, 'https://jobcode.in/example-job/'),
    'https://ats.example/careers/job/42',
  );
});

test('throws when no apply link exists', () => {
  assert.throws(
    () => extractApplyUrl('<a href="/about">About</a>', 'https://jobcode.in/job/'),
    /No Apply link/,
  );
});

test('keeps the ATS job URL when Workday redirects to maintenance', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    url: 'https://community.workday.com/maintenance-page?d=1',
  });

  try {
    assert.equal(
      await resolveRedirects('https://company.myworkdayjobs.com/job/123', 1_000),
      'https://company.myworkdayjobs.com/job/123',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
