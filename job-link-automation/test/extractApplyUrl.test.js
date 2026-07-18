import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalizeKnownApplicationUrl,
  extractApplyUrl,
  isLikelyDirectApplicationUrl,
  isShortenedUrl,
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
    <main>
      <h2>Company Hiring Link</h2>
      <a href="https://company.example/jobs/123">Click Here</a>
      <aside><a href="/another-job">Another company is hiring - Apply Now</a></aside>
    </main>
  `;

  assert.equal(
    extractApplyUrl(html, 'https://jobssforu.in/source-job/'),
    'https://company.example/jobs/123',
  );
});

test('ignores Apply Here advertisements and links outside the article body', () => {
  const html = `
    <aside><a href="https://ads.example/offer">Apply Here</a></aside>
    <article>
      <div class="entry-content">
        <div class="advertisement"><a href="https://ads.example/apply">Apply Now</a></div>
        <h2>Revature Off Campus Hiring Link</h2>
        <p><a href="https://www.revature.com/entry-level-software-engineer">Click Here</a></p>
      </div>
    </article>
    <div class="related-posts"><a href="/another-job-apply-now">Apply Now</a></div>
  `;

  assert.equal(
    extractApplyUrl(html, 'https://onlinestudy4u.in/revature-off-campus-hiring/'),
    'https://www.revature.com/entry-level-software-engineer',
  );
});

test('does not save a social link when a page only offers email or LinkedIn applications', () => {
  const html = `
    <article><div class="entry-content">
      <h2>Capgemini New Hiring Link</h2>
      <p>Send your resume by email.</p>
      <a href="https://linkedin.com/jobs/view/123">Click Here</a>
    </div></article>
  `;

  assert.throws(
    () => extractApplyUrl(html, 'https://onlinestudy4u.in/capgemini-new-hiring/'),
    /No Apply link/,
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
  assert.equal(
    isLikelyDirectApplicationUrl('https://www.revature.com/entry-level-software-engineer'),
    true,
  );
  assert.equal(
    isLikelyDirectApplicationUrl('https://joinsuperset.com/join/#/jobprofiles/123'),
    true,
  );
});

test('recognizes supported URL shorteners', () => {
  assert.equal(isShortenedUrl('https://bit.ly/example'), true);
  assert.equal(isShortenedUrl('https://tinyurl.com/example'), true);
  assert.equal(isShortenedUrl('https://company.example/jobs/1'), false);
});

test('canonicalizes a verified Ashby proxy job URL', () => {
  assert.equal(
    canonicalizeKnownApplicationUrl(
      'https://redis-sanity-proxied.vercel.app/company/careers/role/?ashby_jid=ab70d09b-bfcd-4ee6-8f29-ead82911ea03',
    ),
    'https://jobs.ashbyhq.com/Redis/ab70d09b-bfcd-4ee6-8f29-ead82911ea03',
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
  assert.equal(
    isUnhelpfulDestination(
      'https://app.joinsuperset.com/join/#/signup/student/jobprofiles/123',
    ),
    false,
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

test('preserves a client-side application form fragment after an HTTP redirect', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    url: 'https://www.revature.com/entry-level-software-engineer?',
  });

  try {
    assert.equal(
      await resolveRedirects(
        'https://www.revature.com/entry-level-software-engineer?#entry-level-apply-form',
        1_000,
      ),
      'https://www.revature.com/entry-level-software-engineer?#entry-level-apply-form',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
