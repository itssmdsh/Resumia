import assert from 'node:assert/strict';
import test from 'node:test';
import {
  extractApplyUrl,
  isLikelyDirectApplicationUrl,
  isUnhelpfulDestination,
  resolveRedirects,
} from '../src/extractApplyUrl.js';

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

test('prefers an external Click Here button over related Apply Now articles', () => {
  const html = `
    <a href="https://company.example/jobs/123">Click Here</a>
    <a href="/another-job">Another company is hiring - Apply Now</a>
  `;

  assert.equal(
    extractApplyUrl(html, 'https://jobssforu.in/source-job/'),
    'https://company.example/jobs/123',
  );
});

test('does not invent an Apply URL from unrelated external navigation', () => {
  const html = '<a href="https://company.example/our-story">Our Story</a>';
  assert.throws(
    () => extractApplyUrl(html, 'https://careers.example/open-positions'),
    /No Apply link/,
  );
});

test('recognizes direct ATS job URLs but not aggregator articles or listings', () => {
  assert.equal(
    isLikelyDirectApplicationUrl('https://company.wd5.myworkdayjobs.com/site/job/city/role_123'),
    true,
  );
  assert.equal(
    isLikelyDirectApplicationUrl('https://jobcode.in/company-hiring-apply-now/'),
    false,
  );
  assert.equal(
    isLikelyDirectApplicationUrl('https://fullcreative.recruitee.com/open-positions'),
    false,
  );
});

test('rejects social, error, and generic career destinations', () => {
  assert.equal(isUnhelpfulDestination('https://t.me/jobs_channel'), true);
  assert.equal(isUnhelpfulDestination('https://instagram.com/jobs_channel'), true);
  assert.equal(isUnhelpfulDestination('https://company.example/careers/Error'), true);
  assert.equal(isUnhelpfulDestination('https://company.example/careers'), true);
  assert.equal(
    isUnhelpfulDestination(
      'https://onlinestudy4u.in/another-job/',
      'https://onlinestudy4u.in/source-job/',
    ),
    true,
  );
  assert.equal(isUnhelpfulDestination('https://company.example/jobs/123'), false);
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
